use std::fs;
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

/// Get the path to the app data directory where the SQLite DB lives.
fn db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push("hujjah-quran.db");
    path
}

/// Copy the bundled pre-baked DB from resources to app_data_dir.
/// Re-copies if the target DB is outdated (smaller than bundled).
fn init_db(app: &AppHandle) {
    let target = db_path(app);
    let mut needs_copy = !target.exists();

    // Compare sizes: if bundled is larger, re-copy (schema/data updated)
    if target.exists() {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let bundled = resource_dir.join("resources").join("hujjah-quran.db");
            if bundled.exists() {
                let target_size = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
                let bundled_size = fs::metadata(&bundled).map(|m| m.len()).unwrap_or(0);
                if bundled_size > target_size {
                    println!("[Hujjah] Bundled DB is larger ({} > {}) — re-copying", bundled_size, target_size);
                    needs_copy = true;
                }
            }
        }
    }

    if !needs_copy {
        return;
    }

    // Ensure parent directory exists
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Copy bundled DB from resources
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("resources").join("hujjah-quran.db");
        if bundled.exists() {
            let _ = fs::copy(&bundled, &target);
            println!("[Hujjah] Copied bundled DB to {:?}", target);
        } else {
            println!("[Hujjah] Bundled DB not found at {:?}", bundled);
        }
    }
}

/// TASK 0: Purge legacy PGlite/IndexedDB state.
/// Called from the frontend before initializing the new native DB.
#[tauri::command]
async fn purge_legacy_storage(app: AppHandle) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Delete old PGlite disk directories
    for entry in ["hujjah-vault-disk", "hujjah-vault", "hujjah-minimal"] {
        let p = app_data.join(entry);
        if p.exists() {
            let _ = fs::remove_dir_all(&p);
        }
    }

    // Delete old SQLite DBs if they exist with wrong schema
    for db_name in ["hujjah-old.db", "hujjah.db"] {
        let old_db = app_data.join(db_name);
        if old_db.exists() {
            let _ = fs::remove_file(&old_db);
        }
    }

    Ok("Legacy storage purged".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            init_db(&app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:hujjah-quran.db", vec![])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            purge_legacy_storage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
