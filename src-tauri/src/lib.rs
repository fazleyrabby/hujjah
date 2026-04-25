use std::fs;
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

mod hydrator;
mod attach_engine;
mod downloader;
mod ai;

/// Get the path to the app data directory where the SQLite DB lives.
fn db_path(app: &AppHandle, name: &str) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push(name);
    path
}

/// Copy the bundled pre-baked DB from resources to app_data_dir.
/// Re-copies if the target DB is outdated (smaller than bundled).
fn init_db(app: &AppHandle, db_name: &str, resource_name: &str) {
    let target = db_path(app, db_name);
    let mut needs_copy = !target.exists();

    // Compare sizes: if bundled is larger, re-copy (schema/data updated)
    if target.exists() {
        if let Ok(resource_dir) = app.path().resource_dir() {
            let bundled = resource_dir.join("resources").join(resource_name);
            if bundled.exists() {
                let target_size = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
                let bundled_size = fs::metadata(&bundled).map(|m| m.len()).unwrap_or(0);
                if bundled_size > target_size {
                    println!("[Hujjah] Bundled {} is larger ({} > {}) — re-copying", db_name, bundled_size, target_size);
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
        let bundled = resource_dir.join("resources").join(resource_name);
        if bundled.exists() {
            let _ = fs::copy(&bundled, &target);
            println!("[Hujjah] Copied bundled {} to {:?}", db_name, target);
        } else {
            println!("[Hujjah] Bundled {} not found at {:?}", db_name, bundled);
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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:hujjah-quran.db", vec![])
                .add_migrations("sqlite:hujjah-hadith-core.db", vec![])
                .build(),
        )
        .setup(|app| {
            // Initialize DBs BEFORE plugins to avoid concurrent write conflicts
            init_db(&app.handle(), "hujjah-quran.db", "hujjah-quran.db");
            init_db(&app.handle(), "hujjah-hadith-core.db", "hujjah-hadith-core.db");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            purge_legacy_storage,
            ai::hardware::hardware_profile_cmd,
            ai::model_selector::select_model_tier_cmd,
            ai::inference::run_inference,
            ai::model_downloader::check_native_model_status,
            ai::model_downloader::list_native_models,
            ai::inference_engine::run_native_inference,
            ai::throttle_guard::check_throttle_status,
            ai::llama::run_llama,
            ai::llama::load_llama_model,
            ai::model_manager::check_model_cache,
            hydrator::check_tier_status,
            hydrator::hydrate_tier,
            hydrator::download_research_data,
            attach_engine::initialize_unified_connection,
            attach_engine::global_search,
            attach_engine::get_sanad_graph,
            downloader::get_system_info,
            downloader::list_installed_models,
            downloader::get_available_models,
            downloader::download_model,
            downloader::cancel_download,
            downloader::delete_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
