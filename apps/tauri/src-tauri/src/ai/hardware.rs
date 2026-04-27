use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub platform: String,
    pub is_apple_silicon: bool,
    pub has_coreml: bool,
    pub has_nnapi: bool,
}

/// Gather hardware profile using sysinfo.
/// Safe: read-only, no allocations that could fail.
pub fn get_hardware_profile() -> HardwareProfile {
    let mut sys = System::new_all();
    sys.refresh_all();

    let total_ram = sys.total_memory() as f64 / 1024.0 / 1024.0; // bytes -> GB
    let available_ram = sys.available_memory() as f64 / 1024.0 / 1024.0;

    let platform = format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH);

    #[cfg(target_os = "macos")]
    let is_apple_silicon = std::env::consts::ARCH == "aarch64";
    #[cfg(not(target_os = "macos"))]
    let is_apple_silicon = false;

    // CoreML is available on Apple Silicon macOS and iOS
    let has_coreml = is_apple_silicon || cfg!(target_os = "ios");

    // NNAPI is available on Android
    #[cfg(target_os = "android")]
    let has_nnapi = true;
    #[cfg(not(target_os = "android"))]
    let has_nnapi = false;

    let profile = HardwareProfile {
        total_ram_gb: (total_ram * 100.0).round() / 100.0,
        available_ram_gb: (available_ram * 100.0).round() / 100.0,
        platform,
        is_apple_silicon,
        has_coreml,
        has_nnapi,
    };

    log::info!("[Hardware] Profile: {:?}", profile);
    profile
}

#[tauri::command]
pub fn hardware_profile_cmd() -> HardwareProfile {
    get_hardware_profile()
}
