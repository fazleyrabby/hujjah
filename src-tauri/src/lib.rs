use rusqlite::{Connection, Result as SqlResult};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, AppHandle};

/// Get the path to the app data directory where the SQLite DB lives.
fn db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push("hujjah.db");
    path
}

/// Initialize SQLite with FTS5. The DB is pre-baked in `src-tauri/resources/hujjah.db`.
/// On first run, we copy it to the app data dir. On subsequent runs, we open it in-place.
fn init_db(app: &AppHandle) -> SqlResult<Connection> {
    let target = db_path(app);

    // Ensure parent directory exists
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // If the DB doesn't exist in AppData, copy the bundled pre-baked DB
    if !target.exists() {
        if let Some(resource_dir) = app.path().resource_dir().ok() {
            let bundled = resource_dir.join("resources").join("hujjah.db");
            if bundled.exists() {
                let _ = fs::copy(&bundled, &target);
            }
        }
    }

    let conn = Connection::open(&target)?;

    // Verify schema is present
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS content_store (
            id INTEGER PRIMARY KEY,
            text TEXT NOT NULL,
            ref TEXT NOT NULL,
            type TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_idx USING fts5(text, content='content_store', content_rowid='id');
        "
    )?;

    Ok(conn)
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

    // Delete old SQLite DB if it exists with wrong schema
    let old_db = app_data.join("hujjah-old.db");
    if old_db.exists() {
        let _ = fs::remove_file(&old_db);
    }

    Ok("Legacy storage purged".into())
}

/// TASK 2: Execute raw SQL against the native SQLite DB.
#[tauri::command]
async fn sql_query(app: AppHandle, query: String, params: Vec<serde_json::Value>) -> Result<Vec<serde_json::Value>, String> {
    let conn = init_db(&app).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let column_count = stmt.column_count();
    let column_names: Vec<String> = stmt.column_names().iter().map(|&s| s.to_string()).collect();

    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|v| {
        match v {
            serde_json::Value::String(s) => s.as_str() as &dyn rusqlite::ToSql,
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    &i as &dyn rusqlite::ToSql
                } else {
                    &n.as_f64().unwrap_or(0.0) as &dyn rusqlite::ToSql
                }
            }
            _ => &"" as &dyn rusqlite::ToSql,
        }
    })), |row| {
        let mut obj = serde_json::Map::new();
        for (i, name) in column_names.iter().enumerate() {
            let val: String = row.get(i).unwrap_or_default();
            obj.insert(name.clone(), serde_json::Value::String(val));
        }
        Ok(serde_json::Value::Object(obj))
    }).map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }

    Ok(result)
}

/// Get the path to the native DB file (for debugging).
#[tauri::command]
async fn get_db_path(app: AppHandle) -> Result<String, String> {
    Ok(db_path(&app).to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            purge_legacy_storage,
            sql_query,
            get_db_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
