use std::fs;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::PathBuf;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

// ─── Three-Tier Hydrator ───
// Tier 1: hujjah-quran.db        (Mandatory, bundled)
// Tier 2: hujjah-hadith-core.db  (Kutub al-Sittah, bundled/zstd)
// Tier 3: hujjah-hadith-research.db (650K Sanad, remote download)

/// Check if a tier is hydrated (db exists in AppData).
#[tauri::command]
pub async fn check_tier_status(app: AppHandle, tier: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_name = match tier.as_str() {
        "quran" => "hujjah-quran.db",
        "core" => "hujjah-hadith-core.db",
        "research" => "hujjah-hadith-research.db",
        _ => return Err(format!("Unknown tier: {}", tier)),
    };
    let db_path = app_data.join(db_name);
    if db_path.exists() {
        let size = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
        Ok(format!("ready:{}", size))
    } else {
        Ok("missing".to_string())
    }
}

/// Hydrate a tier from bundled .zst or existing .db.
/// For quran: just checks existence (always bundled).
/// For core: decompresses bundled .zst if not present.
/// For research: checks existence (must be downloaded separately).
#[tauri::command]
pub async fn hydrate_tier(app: AppHandle, tier: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;

    match tier.as_str() {
        "quran" => {
            let db_path = app_data.join("hujjah-quran.db");
            if db_path.exists() {
                Ok("ready".to_string())
            } else {
                Err("Quran DB not found. Reinstall the app.".to_string())
            }
        }

        "core" => {
            let db_path = app_data.join("hujjah-hadith-core.db");
            if db_path.exists() {
                return Ok("ready".to_string());
            }

            let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
            let zst_path = resource_dir.join("resources").join("hujjah-hadith-core.db.zst");

            if zst_path.exists() {
                // Decompress from bundled .zst
                let tmp_path = app_data.join("hujjah-hadith-core.db.tmp");
                let _ = fs::remove_file(&tmp_path);

                let zst_file = fs::File::open(&zst_path).map_err(|e| e.to_string())?;
                let reader = BufReader::with_capacity(8192, zst_file);
                let out_file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
                let mut writer = BufWriter::with_capacity(8192, out_file);

                let mut decoder = zstd::stream::read::Decoder::new(reader)
                    .map_err(|e| e.to_string())?;
                std::io::copy(&mut decoder, &mut writer).map_err(|e| e.to_string())?;
                writer.flush().map_err(|e| e.to_string())?;
                drop(writer);

                fs::rename(&tmp_path, &db_path).map_err(|e| e.to_string())?;
                println!("[Hydrator] Core tier hydrated -> {:?}", db_path);
                Ok("hydrated".to_string())
            } else {
                // Fallback: copy plain .db if no .zst
                let bundled_db = resource_dir.join("resources").join("hujjah-hadith-core.db");
                if bundled_db.exists() {
                    fs::copy(&bundled_db, &db_path).map_err(|e| e.to_string())?;
                    Ok("copied".to_string())
                } else {
                    Err("Core hadith data not found in bundle.".to_string())
                }
            }
        }

        "research" => {
            let db_path = app_data.join("hujjah-hadith-research.db");
            if db_path.exists() {
                Ok("ready".to_string())
            } else {
                Ok("missing".to_string())
            }
        }

        _ => Err(format!("Unknown tier: {}", tier)),
    }
}

/// Download Tier 3 (Research) from remote URL with resume support.
#[tauri::command]
pub async fn download_research_data(
    app: AppHandle,
    url: String,
    expected_hash: String,
) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let filename = "hujjah-hadith-research.db.zst";
    let file_path = app_data.join(filename);
    let tmp_path = app_data.join(format!("{}.tmp", filename));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;

    // HEAD request for total size
    let total_size: u64 = {
        let resp = client.head(&url).send().await.map_err(|e| e.to_string())?;
        resp.headers()
            .get("content-length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .unwrap_or(0)
    };

    // Open for append (resume)
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&tmp_path)
        .map_err(|e| e.to_string())?;

    let start_offset = file.metadata().map(|m| m.len()).unwrap_or(0);

    let mut request = client.get(&url);
    if start_offset > 0 && start_offset < total_size {
        request = request.header("Range", format!("bytes={}-", start_offset));
    }

    let mut response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status();

    if !status.is_success() && status.as_u16() != 206 {
        return Err(format!("Download failed: HTTP {}", status));
    }

    let mut downloaded = start_offset;

    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let _ = app.emit("download-progress", DownloadProgress {
            downloaded,
            total: total_size,
            percent: if total_size > 0 {
                (downloaded as f64 / total_size as f64 * 100.0) as f32
            } else {
                0.0
            },
            status: "downloading".to_string(),
        });
    }

    drop(file);

    // Verify SHA-256
    let _ = app.emit("download-progress", DownloadProgress {
        downloaded,
        total: total_size,
        percent: 100.0,
        status: "verifying".to_string(),
    });

    let actual_hash = compute_file_hash(&tmp_path).await?;
    if actual_hash.to_lowercase() != expected_hash.to_lowercase() {
        let _ = fs::remove_file(&tmp_path);
        return Err(format!(
            "Hash mismatch: expected {} got {}",
            expected_hash, actual_hash
        ));
    }

    // Atomic rename
    fs::rename(&tmp_path, &file_path).map_err(|e| e.to_string())?;

    let _ = app.emit("download-progress", DownloadProgress {
        downloaded: total_size,
        total: total_size,
        percent: 100.0,
        status: "completed".to_string(),
    });

    println!("[Downloader] Research tier verified & saved");
    Ok("downloaded".to_string())
}

/// ─── Hash Utility ───
async fn compute_file_hash(path: &PathBuf) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];

    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    Ok(hex::encode(hasher.finalize()))
}

/// ─── Progress Payload ───
#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f32,
    pub status: String,
}
