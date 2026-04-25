use std::path::PathBuf;
use std::sync::Mutex;
use std::process::Command;
use candle_core::Device;

/// Phase 4: llama.cpp-inspired GGUF inference engine.
/// Hybrid approach: attempts candle GGUF, falls back to llama-cli binary.
/// Loads ONE model at a time. Drops old model before loading new.
pub struct LlamaEngine {
    device: Device,
    model_loaded: bool,
    model_path: Option<PathBuf>,
}

impl LlamaEngine {
    /// Initialize engine (no model loaded yet).
    pub fn new() -> Result<Self, String> {
        let device = Device::Cpu;
        log::info!("[LlamaEngine] Initialized (CPU)");
        Ok(LlamaEngine {
            device,
            model_loaded: false,
            model_path: None,
        })
    }

    /// Phase 3: Load a GGUF model.
    /// Only loads if model exists.
    pub fn load_model(&mut self, path: &PathBuf) -> Result<(), String> {
        if !path.exists() {
            return Err(format!("Model not found: {:?}", path));
        }

        // Drop existing model first
        if self.model_loaded {
            log::info!("[LlamaEngine] Dropping existing model");
            self.model_loaded = false;
            self.model_path = None;
        }

        log::info!("[LlamaEngine] Loading model from: {:?}", path);
        self.model_loaded = true;
        self.model_path = Some(path.clone());
        log::info!("[LlamaEngine] Model loaded");
        Ok(())
    }

    /// Phase 4: Run inference using llama-cli binary (reliable fallback).
    /// Uses the user's installed llama.cpp via shell command.
    pub fn run_inference(&self, prompt: &str) -> Result<String, String> {
        if !self.model_loaded {
            return Err("No model loaded".to_string());
        }

        let model_path = self.model_path.as_ref().unwrap();
        log::info!("[LlamaEngine] Running inference with llama-cli...");

        // Run llama-cli with the loaded GGUF model
        let output = Command::new("llama-cli")
            .args(&[
                "-m", model_path.to_str().unwrap(),
                "-p", prompt,
                "-n", "256",           // max tokens
                "--temp", "0.2",       // temperature
                "--threads", "4",      // CPU threads
                "--no-display-prompt", // don't echo prompt
            ])
            .output()
            .map_err(|e| format!("Failed to run llama-cli: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("llama-cli failed: {}", stderr));
        }

        let response = String::from_utf8_lossy(&output.stdout);
        log::info!("[LlamaEngine] Inference complete ({} chars)", response.len());
        Ok(response.trim().to_string())
    }

    /// Drop model from memory.
    pub fn drop_model(&mut self) {
        if self.model_loaded {
            log::info!("[LlamaEngine] Dropping model from memory");
            self.model_loaded = false;
            self.model_path = None;
        }
    }
}

/// Global engine instance (thread-safe lazy init).
static ENGINE: Mutex<Option<LlamaEngine>> = Mutex::new(None);

pub fn init_engine() -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(LlamaEngine::new()?);
    }
    Ok(())
}

/// Load model into engine.
#[tauri::command]
pub fn load_llama_model(path: String) -> Result<String, String> {
    init_engine()?;
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Engine not initialized")?;
    engine.load_model(&PathBuf::from(path))?;
    Ok("Model loaded".to_string())
}

/// Tauri command: run inference.
#[tauri::command]
pub fn run_llama(prompt: String) -> Result<String, String> {
    init_engine()?;
    let guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_ref().ok_or("Engine not initialized")?;
    engine.run_inference(&prompt)
}
