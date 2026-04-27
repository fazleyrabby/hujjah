use futures::StreamExt;
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use sysinfo::System;
use tauri::{AppHandle, Emitter, Manager};

// ─── Model Catalog ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub size_mb: u64,
    pub min_ram_gb: u64,
    pub recommended_ram_gb: u64,
    pub url: String,
    pub model_type: String, // "embedding" | "generation"
    pub bundled: bool,
}

fn model_catalog() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "bge-m3".to_string(),
            name: "BGE-M3 Multilingual Embeddings".to_string(),
            description: "1024-dim multilingual embeddings for semantic search (Arabic/Bengali/English). Required.".to_string(),
            size_mb: 550,
            min_ram_gb: 2,
            recommended_ram_gb: 4,
            url: "".to_string(), // Bundled — no download needed
            model_type: "embedding".to_string(),
            bundled: true,
        },
        ModelInfo {
            id: "qwen-0.5b-q4".to_string(),
            name: "Qwen 2.5-0.5B Instruct (GGUF Q4)".to_string(),
            description: "Lightweight text generation for mobile. Good for basic Q&A.".to_string(),
            size_mb: 350,
            min_ram_gb: 2,
            recommended_ram_gb: 4,
            url: "".to_string(), // Bundled — no download needed
            model_type: "generation".to_string(),
            bundled: true,
        },
        ModelInfo {
            id: "qwen-1.5b-q4".to_string(),
            name: "Qwen 2.5-1.5B Instruct (GGUF Q4)".to_string(),
            description: "Better reasoning and longer coherent responses for desktop.".to_string(),
            size_mb: 1000,
            min_ram_gb: 4,
            recommended_ram_gb: 8,
            url: "".to_string(),
            model_type: "generation".to_string(),
            bundled: true,
        },
    ]
}

// ─── System Info ───

#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub total_ram_gb: u64,
    pub cpu_cores: usize,
    pub os: String,
    pub arch: String,
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram_gb = sys.total_memory() / 1024 / 1024; // sysinfo returns KB
    let cpu_cores = sys.cpus().len();
    let os = System::name().unwrap_or_else(|| "Unknown".to_string());
    let arch = std::env::consts::ARCH.to_string();

    SystemInfo {
        total_ram_gb,
        cpu_cores,
        os,
        arch,
    }
}

// ─── Model Directory ───

fn models_dir(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push("models");
    path
}

fn ensure_models_dir(app: &AppHandle) -> PathBuf {
    let dir = models_dir(app);
    let _ = fs::create_dir_all(&dir);
    dir
}

// ─── List Installed Models ───

#[derive(Debug, Clone, Serialize)]
pub struct InstalledModel {
    pub id: String,
    pub name: String,
    pub size_mb: u64,
    pub path: String,
}

#[tauri::command]
pub fn list_installed_models(app: AppHandle) -> Result<Vec<InstalledModel>, String> {
    let dir = models_dir(&app);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut installed = vec![];
    let catalog = model_catalog();

    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let id = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }

        // Calculate size recursively
        let size_bytes = dir_size(&path);
        let size_mb = size_bytes / 1024 / 1024;

        let name = catalog
            .iter()
            .find(|m| m.id == id)
            .map(|m| m.name.clone())
            .unwrap_or_else(|| id.clone());

        installed.push(InstalledModel {
            id,
            name,
            size_mb,
            path: path.to_string_lossy().to_string(),
        });
    }

    Ok(installed)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += dir_size(&p);
            }
        }
    }
    total
}

// ─── Available Models (with recommendation) ───

#[derive(Debug, Clone, Serialize)]
pub struct AvailableModel {
    #[serde(flatten)]
    pub info: ModelInfo,
    pub installed: bool,
    pub recommended: bool,
}

#[tauri::command]
pub fn get_available_models(app: AppHandle) -> Result<Vec<AvailableModel>, String> {
    let sys = get_system_info();
    let installed = list_installed_models(app)?;
    let installed_ids: std::collections::HashSet<String> =
        installed.into_iter().map(|m| m.id).collect();

    let available: Vec<AvailableModel> = model_catalog()
        .into_iter()
        .map(|info| {
            let recommended = sys.total_ram_gb >= info.recommended_ram_gb;
            AvailableModel {
                installed: installed_ids.contains(&info.id) || info.bundled,
                recommended,
                info,
            }
        })
        .collect();

    Ok(available)
}

// ─── Download State ───

#[derive(Default)]
pub struct DownloadState {
    pub cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl DownloadState {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self::default()
    }
}

// ─── Download Model ───

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded_mb: u64,
    pub total_mb: u64,
    pub percent: f32,
    pub status: String, // "downloading" | "completed" | "error" | "cancelled"
    pub error: Option<String>,
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    state: tauri::State<'_, DownloadState>,
    model_id: String,
    url: String,
) -> Result<String, String> {
    if url.is_empty() {
        return Err("No download URL configured for this model.".to_string());
    }

    let dir = ensure_models_dir(&app);
    let model_dir = dir.join(&model_id);
    let _ = fs::create_dir_all(&model_dir);

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = state.cancel_flags.lock().map_err(|e| e.to_string())?;
        flags.insert(model_id.clone(), cancel_flag.clone());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    let total_size = response
        .content_length()
        .unwrap_or(0);
    let total_mb = total_size / 1024 / 1024;

    let filename = url
        .split('/')
        .last()
        .unwrap_or("model.zip")
        .to_string();
    let dest_path = model_dir.join(&filename);

    let mut file = fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::Relaxed) {
            let _ = fs::remove_file(&dest_path);
            let _ = app.emit("download-progress", DownloadProgress {
                model_id: model_id.clone(),
                downloaded_mb: downloaded / 1024 / 1024,
                total_mb,
                percent: 0.0,
                status: "cancelled".to_string(),
                error: None,
            });
            return Ok("Cancelled".to_string());
        }

        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let percent = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0) as f32
        } else {
            0.0
        };

        let _ = app.emit("download-progress", DownloadProgress {
            model_id: model_id.clone(),
            downloaded_mb: downloaded / 1024 / 1024,
            total_mb,
            percent,
            status: "downloading".to_string(),
            error: None,
        });
    }

    // If it's a zip, extract it
    if filename.ends_with(".zip") {
        let _ = app.emit("download-progress", DownloadProgress {
            model_id: model_id.clone(),
            downloaded_mb: total_mb,
            total_mb,
            percent: 100.0,
            status: "extracting".to_string(),
            error: None,
        });

        let zip_file = fs::File::open(&dest_path).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| e.to_string())?;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let outpath = model_dir.join(file.name());
            if file.name().ends_with('/') {
                let _ = fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = fs::create_dir_all(p);
                }
                let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
                let _ = std::io::copy(&mut file, &mut outfile);
            }
        }
        let _ = fs::remove_file(&dest_path);
    }

    let _ = app.emit("download-progress", DownloadProgress {
        model_id: model_id.clone(),
        downloaded_mb: total_mb,
        total_mb,
        percent: 100.0,
        status: "completed".to_string(),
        error: None,
    });

    {
        let mut flags = state.cancel_flags.lock().map_err(|e| e.to_string())?;
        flags.remove(&model_id);
    }

    Ok("Downloaded".to_string())
}

#[tauri::command]
pub fn cancel_download(
    state: tauri::State<'_, DownloadState>,
    model_id: String,
) -> Result<String, String> {
    let flags = state.cancel_flags.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = flags.get(&model_id) {
        flag.store(true, Ordering::Relaxed);
        Ok("Cancellation requested".to_string())
    } else {
        Err("No active download for this model".to_string())
    }
}

#[tauri::command]
pub fn delete_model(app: AppHandle, model_id: String) -> Result<String, String> {
    let dir = models_dir(&app).join(&model_id);
    if dir.exists() {
        let _ = fs::remove_dir_all(&dir);
    }
    Ok("Deleted".to_string())
}
