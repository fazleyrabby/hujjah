use std::path::PathBuf;
use std::sync::Mutex;
use std::process::{Command, Child, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::System;
use serde_json::{json, Value};

/// Device capability tier for model selection.
#[derive(Debug, Clone, Copy)]
pub enum DeviceTier {
    Mobile,
    Desktop,
}

impl DeviceTier {
    pub fn detect() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let total_ram_gb = sys.total_memory() / 1024 / 1024;
        if total_ram_gb < 4 { DeviceTier::Mobile } else { DeviceTier::Desktop }
    }

    pub fn default_model_file(&self) -> &'static str {
        match self {
            DeviceTier::Mobile => "qwen2.5-0.5b-instruct-q4_k_m.gguf",
            DeviceTier::Desktop => "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        }
    }

    pub fn model_dir(&self) -> &'static str {
        match self {
            DeviceTier::Mobile => "qwen-0.5b-q4",
            DeviceTier::Desktop => "qwen-1.5b-q4",
        }
    }
}

/// Hardware detection for GPU offload.
#[derive(Debug, Clone, Copy)]
pub struct HardwareProfile {
    pub is_apple_silicon: bool,
    pub is_cuda_available: bool,
    pub total_ram_gb: u64,
    pub cpu_cores: usize,
}

impl HardwareProfile {
    pub fn detect() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        
        let arch = std::env::consts::ARCH;
        let is_apple_silicon = cfg!(target_os = "macos") && (arch == "aarch64" || arch == "arm64");
        
        HardwareProfile {
            is_apple_silicon,
            is_cuda_available: false, // Could detect nvidia-smi here
            total_ram_gb: sys.total_memory() / 1024 / 1024,
            cpu_cores: sys.cpus().len(),
        }
    }

    /// Optimal thread count for inference.
    /// GPU offload = fewer CPU threads needed.
    pub fn optimal_threads(&self) -> usize {
        if self.is_apple_silicon || self.is_cuda_available {
            // GPU handles the heavy lifting
            2
        } else {
            // CPU-only: use half the cores to leave headroom for OS
            (self.cpu_cores / 2).max(2)
        }
    }

    /// Whether to use GPU offload.
    pub fn use_gpu_offload(&self) -> bool {
        self.is_apple_silicon || self.is_cuda_available
    }

    /// GPU layer count for -ngl flag.
    /// 99 = all layers (Apple Silicon Metal or CUDA).
    pub fn gpu_layers(&self) -> i32 {
        if self.use_gpu_offload() { 99 } else { 0 }
    }
}

/// llama.cpp HTTP server backend.
pub struct LlamaEngine {
    model_loaded: bool,
    model_path: Option<PathBuf>,
    tier: DeviceTier,
    server_process: Option<Child>,
    server_url: String,
    hw: HardwareProfile,
}

impl LlamaEngine {
    pub fn new() -> Result<Self, String> {
        let tier = DeviceTier::detect();
        let hw = HardwareProfile::detect();
        log::info!("[LlamaEngine] Initialized | Tier: {:?} | Hardware: {:?}", tier, hw);
        Ok(LlamaEngine {
            model_loaded: false,
            model_path: None,
            tier,
            server_process: None,
            server_url: "http://127.0.0.1:8081".to_string(),
            hw,
        })
    }

    pub fn tier(&self) -> DeviceTier { self.tier }
    pub fn hardware(&self) -> &HardwareProfile { &self.hw }

    /// Check if llama-server binary is available.
    pub fn is_server_available() -> bool {
        Command::new("llama-server")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Check if server is responding.
    fn is_server_running(&self) -> bool {
        ureq::get(&format!("{}/health", self.server_url))
            .call()
            .map(|r| r.status() == 200)
            .unwrap_or(false)
    }

    /// Build server args based on hardware profile.
    fn build_server_args(&self, model_path: &PathBuf) -> Vec<String> {
        let mut args = vec![
            "-m".to_string(), model_path.to_str().unwrap().to_string(),
            "-c".to_string(), "2048".to_string(),
            "--threads".to_string(), self.hw.optimal_threads().to_string(),
            "--batch-size".to_string(), "512".to_string(),
            "--ubatch-size".to_string(), "128".to_string(),
            "--host".to_string(), "0.0.0.0".to_string(),
            "--port".to_string(), "8081".to_string(),
            "--no-webui".to_string(),
        ];

        // CRITICAL: GPU offload prevents CPU contention / UI freezing
        if self.hw.use_gpu_offload() {
            args.push("-ngl".to_string());
            args.push(self.hw.gpu_layers().to_string());
            log::info!("[LlamaEngine] GPU offload enabled: {} layers", self.hw.gpu_layers());
        } else {
            log::warn!("[LlamaEngine] Running CPU-only — this may cause UI stutter");
        }

        args
    }

    /// Start llama-server in background.
    fn start_server(&mut self, model_path: &PathBuf) -> Result<(), String> {
        if !Self::is_server_available() {
            return Err(
                "llama-server not found in PATH.\n\n"
                .to_string()
                + "Install: brew install llama.cpp"
            );
        }

        self.stop_server();

        let args = self.build_server_args(model_path);
        log::info!("[LlamaEngine] Starting llama-server: llama-server {:?}", args);

        let mut child = Command::new("llama-server")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start llama-server: {}", e))?;

        // Log readers
        if let Some(stdout) = child.stdout.take() {
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    log::info!("[llama-server] {}", line);
                }
            });
        }
        if let Some(stderr) = child.stderr.take() {
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines().flatten() {
                    // llama-server logs model loading progress to stderr
                    if line.contains("load") || line.contains("offloading") || line.contains("Metal") {
                        log::info!("[llama-server] {}", line);
                    } else {
                        log::debug!("[llama-server] {}", line);
                    }
                }
            });
        }

        self.server_process = Some(child);

        // Wait for server to be ready (up to 60s)
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(60) {
            if self.is_server_running() {
                log::info!("[LlamaEngine] Server is ready!");
                return Ok(());
            }
            thread::sleep(Duration::from_millis(500));
        }

        self.stop_server();
        Err("llama-server failed to start within 60 seconds".to_string())
    }

    /// Stop the background server.
    fn stop_server(&mut self) {
        if let Some(mut child) = self.server_process.take() {
            log::info!("[LlamaEngine] Stopping llama-server...");
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// Load a GGUF model (starts the server).
    pub fn load_model(&mut self, path: &PathBuf) -> Result<(), String> {
        if !path.exists() {
            return Err(format!("Model not found: {:?}", path));
        }
        self.stop_server();
        self.start_server(path)?;
        self.model_loaded = true;
        self.model_path = Some(path.clone());
        log::info!("[LlamaEngine] Model loaded and server running");
        Ok(())
    }

    /// Auto-load default model for detected tier.
    pub fn load_default_model(&mut self) -> Result<(), String> {
        let model_file = self.tier.default_model_file();
        let model_dir = self.tier.model_dir();

        let search_paths = [
            PathBuf::from(format!("src-tauri/resources/models/{}/{}", model_dir, model_file)),
            PathBuf::from(format!("resources/models/{}/{}", model_dir, model_file)),
            PathBuf::from(format!("models/{}/{}", model_dir, model_file)),
        ];

        for path in &search_paths {
            if path.exists() {
                return self.load_model(path);
            }
        }

        let fallback_tier = match self.tier {
            DeviceTier::Mobile => DeviceTier::Desktop,
            DeviceTier::Desktop => DeviceTier::Mobile,
        };
        let fallback_paths = [
            PathBuf::from(format!("src-tauri/resources/models/{}/{}", fallback_tier.model_dir(), fallback_tier.default_model_file())),
            PathBuf::from(format!("resources/models/{}/{}", fallback_tier.model_dir(), fallback_tier.default_model_file())),
            PathBuf::from(format!("models/{}/{}", fallback_tier.model_dir(), fallback_tier.default_model_file())),
        ];

        for path in &fallback_paths {
            if path.exists() {
                log::warn!("[LlamaEngine] Falling back to {:?} model", fallback_tier);
                return self.load_model(path);
            }
        }

        Err("No GGUF model found. Please ensure models are in src-tauri/resources/models/".to_string())
    }

    /// Run inference via HTTP API.
    pub fn run_inference(&self, prompt: &str) -> Result<String, String> {
        if !self.model_loaded || !self.is_server_running() {
            return Err("Server not running. Please load a model first.".to_string());
        }

        log::info!("[LlamaEngine] Sending inference request ({} chars)", prompt.len());

        let body = json!({
            "prompt": prompt,
            "n_predict": 512,
            "temperature": 0.7,
            "top_p": 0.9,
            "repeat_penalty": 1.1,
            "seed": -1,
            "cache_prompt": false,
            "stop": ["<|im_end|>", "<|im_start|>user", "<|im_start|>"],
        });

        let response = ureq::post(&format!("{}/completion", self.server_url))
            .set("Content-Type", "application/json")
            .send_json(&body)
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        let json: Value = response.into_json().map_err(|e| e.to_string())?;
        let content = json["content"]
            .as_str()
            .or_else(|| json["text"].as_str())
            .unwrap_or("")
            .trim()
            .to_string();

        log::info!("[LlamaEngine] Response received ({} chars)", content.len());
        Ok(content)
    }
}

impl Drop for LlamaEngine {
    fn drop(&mut self) {
        self.stop_server();
    }
}

// ─── Global Engine ───

static ENGINE: Mutex<Option<LlamaEngine>> = Mutex::new(None);

pub fn init_engine() -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(LlamaEngine::new()?);
    }
    Ok(())
}

#[tauri::command]
pub fn get_device_tier() -> Result<String, String> {
    init_engine()?;
    let guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_ref().ok_or("Engine not initialized")?;
    Ok(format!("{:?}", engine.tier()).to_lowercase())
}

#[tauri::command]
pub fn get_hardware_profile() -> Result<String, String> {
    init_engine()?;
    let guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_ref().ok_or("Engine not initialized")?;
    let hw = engine.hardware();
    Ok(format!(
        "Apple Silicon: {} | CUDA: {} | RAM: {}GB | Cores: {} | Threads: {} | GPU Layers: {}",
        hw.is_apple_silicon,
        hw.is_cuda_available,
        hw.total_ram_gb,
        hw.cpu_cores,
        hw.optimal_threads(),
        hw.gpu_layers()
    ))
}

#[tauri::command]
pub fn load_llama_model(path: Option<String>) -> Result<String, String> {
    init_engine()?;
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_mut().ok_or("Engine not initialized")?;

    if let Some(p) = path {
        engine.load_model(&PathBuf::from(p))?;
    } else {
        engine.load_default_model()?;
    }

    Ok(format!("Model loaded | Tier: {:?}", engine.tier()))
}

#[tauri::command]
pub fn run_llama(prompt: String) -> Result<String, String> {
    init_engine()?;
    let guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = guard.as_ref().ok_or("Engine not initialized")?;
    engine.run_inference(&prompt)
}
