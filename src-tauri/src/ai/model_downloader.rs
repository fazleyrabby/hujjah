use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};
use crate::ai::model_selector::ModelTier;

/// Model download status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelStatus {
    /// Model files exist locally
    Ready,
    /// Model needs to be downloaded
    Missing,
    /// Download in progress
    Downloading,
    /// Download failed
    Error(String),
}

/// Get the path where native models are stored.
/// app_data_dir/models/{tier}/
pub fn model_dir(app: &AppHandle, tier: &ModelTier) -> PathBuf {
    let mut path = app.path().app_data_dir().expect("failed to get app data dir");
    path.push("models");
    path.push(tier.as_str());
    path
}

/// Check if a model exists locally.
/// Safe: only checks file existence, no memory allocation.
pub fn check_model_status(app: &AppHandle, tier: &ModelTier) -> ModelStatus {
    let dir = model_dir(app, tier);

    if !dir.exists() {
        log::info!("[ModelDownloader] Model dir missing: {:?}", dir);
        return ModelStatus::Missing;
    }

    // Check for model.onnx or model.safetensors
    let has_onnx = dir.join("model.onnx").exists();
    let has_safetensors = dir.join("model.safetensors").exists();

    if has_onnx || has_safetensors {
        log::info!("[ModelDownloader] Model ready at: {:?}", dir);
        ModelStatus::Ready
    } else {
        log::info!("[ModelDownloader] Model files missing in: {:?}", dir);
        ModelStatus::Missing
    }
}

/// Phase 5: Stub for model download.
/// Reports status but does NOT download yet.
/// Will be wired to R2 download in Phase 6.
#[tauri::command]
pub async fn check_native_model_status(
    app: AppHandle,
    tier: String,
) -> Result<ModelStatus, String> {
    let tier = match tier.as_str() {
        "lite" => ModelTier::Lite,
        "standard" => ModelTier::Standard,
        "research" => ModelTier::Research,
        _ => return Err(format!("Unknown tier: {}", tier)),
    };

    let status = check_model_status(&app, &tier);
    Ok(status)
}

/// Get list of installed native models.
#[tauri::command]
pub async fn list_native_models(app: AppHandle) -> Result<Vec<String>, String> {
    let mut installed = Vec::new();

    for tier in [ModelTier::Lite, ModelTier::Standard, ModelTier::Research] {
        if let ModelStatus::Ready = check_model_status(&app, &tier) {
            installed.push(tier.as_str().to_string());
        }
    }

    Ok(installed)
}
