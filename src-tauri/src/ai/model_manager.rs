use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

/// Model info for cache tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub tier: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub exists: bool,
}

/// Model cache directory structure:
/// app_data_dir/models/
///   ├── lite/
///   │   └── model.gguf
///   ├── standard/
///   │   └── model.gguf
///   └── research/
///       └── model.gguf
const MODELS_DIR: &str = "models";

/// Get base models directory.
pub fn models_base_dir(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push(MODELS_DIR);
    path
}

/// Get path for a specific model tier.
pub fn model_dir(app: &AppHandle, tier: &str) -> PathBuf {
    let mut path = models_base_dir(app);
    path.push(tier);
    path
}

/// Get expected model file path.
pub fn model_path(app: &AppHandle, tier: &str, filename: &str) -> PathBuf {
    let mut path = model_dir(app, tier);
    path.push(filename);
    path
}

/// Check if a model exists and get its info.
pub fn get_model_info(app: &AppHandle, tier: &str, filename: &str) -> ModelInfo {
    let path = model_path(app, tier, filename);
    let exists = path.exists();
    let size_bytes = if exists {
        std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    ModelInfo {
        name: filename.to_string(),
        tier: tier.to_string(),
        path,
        size_bytes,
        exists,
    }
}

/// Ensure model directory exists.
pub fn ensure_model_dir(app: &AppHandle, tier: &str) -> Result<PathBuf, String> {
    let dir = model_dir(app, tier);
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        log::info!("[ModelManager] Created directory: {:?}", dir);
    }
    Ok(dir)
}

/// Phase 2: Check all model statuses.
/// Reports which models are available without loading them.
#[tauri::command]
pub async fn check_model_cache(app: AppHandle) -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();

    // Check Lite tier (0.5B)
    models.push(get_model_info(&app, "lite", "qwen2.5-0.5b-instruct-q4_k_m.gguf"));

    // Check Standard tier (1.5B)
    models.push(get_model_info(&app, "standard", "qwen2.5-1.5b-instruct-q4_k_m.gguf"));

    log::info!("[ModelManager] Checked {} model(s)", models.len());
    Ok(models)
}

/// Get path to model if it exists.
/// Returns None if model not found.
pub fn get_model_path_if_exists(
    app: &AppHandle,
    tier: &str,
    filename: &str,
) -> Option<PathBuf> {
    let info = get_model_info(app, tier, filename);
    if info.exists {
        Some(info.path)
    } else {
        None
    }
}
