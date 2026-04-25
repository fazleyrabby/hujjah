use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use candle_core::{Device, Tensor};
use candle_transformers::generation::LogitsProcessor;
use tokenizers::Tokenizer;
use crate::ai::model_selector::ModelTier;
use crate::ai::model_downloader::{check_model_status, ModelStatus};

/// Inference session for Lite model (0.5B).
/// Wrapped in Option so we can explicitly drop it.
struct InferenceSession {
    device: Device,
    tokenizer: Tokenizer,
    // Model would go here — stub for now
    model_loaded: bool,
}

/// Global session — None means not loaded.
/// Mutex for thread safety.
static SESSION: Mutex<Option<InferenceSession>> = Mutex::new(None);

/// Load the Lite model if available.
/// Returns true if model is ready for inference.
fn try_load_lite_model(app: &AppHandle) -> Result<bool, String> {
    let tier = ModelTier::Lite;

    // Check if model exists locally
    if let ModelStatus::Missing = check_model_status(app, &tier) {
        log::info!("[InferenceEngine] Lite model not found, skipping load");
        return Ok(false);
    }

    log::info!("[InferenceEngine] Attempting to load Lite model...");

    // Initialize device
    // NOTE: GPU (Metal/CUDA) requires candle-core feature flags.
    // For fast compilation and maximum compatibility, use CPU.
    let device = Device::Cpu;
    log::info!("[InferenceEngine] Using CPU device");

    // TODO: Load actual model weights here
    // For now, we check that the tokenizer exists
    let model_dir = crate::ai::model_downloader::model_dir(app, &tier);
    let tokenizer_path = model_dir.join("tokenizer.json");

    if !tokenizer_path.exists() {
        log::warn!("[InferenceEngine] Tokenizer not found at {:?}", tokenizer_path);
        return Ok(false);
    }

    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer: {}", e))?;

    let session = InferenceSession {
        device,
        tokenizer,
        model_loaded: false, // Set to true when model weights are loaded
    };

    let mut guard = SESSION.lock().map_err(|e| e.to_string())?;
    *guard = Some(session);

    log::info!("[InferenceEngine] Lite model session initialized (weights not loaded yet)");
    Ok(true)
}

/// Run inference using the loaded Lite model.
/// If model is not loaded or inference fails, returns Err.
fn run_lite_inference(prompt: &str) -> Result<String, String> {
    let guard = SESSION.lock().map_err(|e| e.to_string())?;

    let session = match guard.as_ref() {
        Some(s) => s,
        None => return Err("No inference session loaded".to_string()),
    };

    if !session.model_loaded {
        return Err("Model weights not loaded yet".to_string());
    }

    // Tokenize prompt
    let encoding = session.tokenizer.encode(prompt, true)
        .map_err(|e| format!("Tokenization failed: {}", e))?;

    let input_ids = encoding.get_ids();
    log::info!("[InferenceEngine] Input tokens: {}", input_ids.len());

    // TODO: Run actual model inference here
    // For now, return a placeholder
    Ok(format!(
        "[Native AI — Lite Model] Processing: \"{}\" ({} tokens)",
        &prompt[..prompt.len().min(40)],
        input_ids.len()
    ))
}

/// Explicitly drop the inference session to free memory.
pub fn drop_session() {
    if let Ok(mut guard) = SESSION.lock() {
        if guard.is_some() {
            log::info!("[InferenceEngine] Dropping inference session");
            *guard = None;
        }
    }
}

/// Phase 6: Main inference entrypoint.
/// Attempts native inference if model is available, otherwise returns Err.
#[tauri::command]
pub async fn run_native_inference(
    app: AppHandle,
    prompt: String,
) -> Result<String, String> {
    log::info!("[InferenceEngine] Request received ({} chars)", prompt.len());

    // Try to load model if not already loaded
    let loaded = try_load_lite_model(&app)?;

    if !loaded {
        return Err("Lite model not available. Download it first.".to_string());
    }

    // Run inference
    let result = run_lite_inference(&prompt);

    // Always drop session after inference to free RAM
    drop_session();

    result
}
