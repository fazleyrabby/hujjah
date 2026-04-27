use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceRequest {
    pub prompt: String,
}

/// Phase 4: Inference stub — returns mock response.
/// No real model loaded yet. Safe to call, no side effects.
#[tauri::command]
pub async fn run_inference(request: InferenceRequest) -> Result<String, String> {
    log::info!(
        "[InferenceStub] Received prompt ({} chars): {}",
        request.prompt.len(),
        &request.prompt[..request.prompt.len().min(50)]
    );

    // Mock response — indicates native AI is not yet enabled
    let mock_response = format!(
        "[Native AI Stub] Received your question about: \"{}\"\n\nNative inference is not yet enabled. To use this feature, set NEXT_PUBLIC_USE_NATIVE_AI=true and ensure the model is downloaded.",
        &request.prompt[..request.prompt.len().min(40)]
    );

    log::info!("[InferenceStub] Returning mock response");
    Ok(mock_response)
}
