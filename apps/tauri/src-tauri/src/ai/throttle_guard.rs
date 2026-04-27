use serde::{Deserialize, Serialize};
use crate::ai::hardware::get_hardware_profile;

/// Throttle reasons.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ThrottleReason {
    LowMemory,
    BatterySaver,
    Thermal,
    None,
}

/// Check if inference should be throttled.
/// Returns reason if throttling is needed, None if safe to proceed.
///
/// Phase 7: Mobile-safe guards.
/// On desktop, primarily checks memory.
/// On Android, would check battery saver and thermal state.
pub fn should_throttle() -> ThrottleReason {
    let profile = get_hardware_profile();

    // Memory guard: if available RAM < 2GB, throttle
    if profile.available_ram_gb < 2.0 {
        log::warn!(
            "[ThrottleGuard] Low memory: {:.1}GB available. Skipping inference.",
            profile.available_ram_gb
        );
        return ThrottleReason::LowMemory;
    }

    // Desktop: no battery/thermal API available
    // On Android, we would check:
    // - PowerManager.isPowerSaveMode()
    // - BatteryManager temperature
    // - Thermal status via HardwarePropertiesManager
    #[cfg(target_os = "android")]
    {
        // TODO: Implement Android battery/thermal checks
        // For now, assume safe on Android emulator
        log::info!("[ThrottleGuard] Android — battery/thermal check stubbed");
    }

    #[cfg(not(target_os = "android"))]
    {
        log::info!("[ThrottleGuard] Desktop — memory OK, proceeding");
    }

    ThrottleReason::None
}

/// Check if we should throttle and return a user-friendly message.
#[tauri::command]
pub fn check_throttle_status() -> Result<String, String> {
    match should_throttle() {
        ThrottleReason::LowMemory => Ok("throttled:low_memory".to_string()),
        ThrottleReason::BatterySaver => Ok("throttled:battery".to_string()),
        ThrottleReason::Thermal => Ok("throttled:thermal".to_string()),
        ThrottleReason::None => Ok("ok".to_string()),
    }
}
