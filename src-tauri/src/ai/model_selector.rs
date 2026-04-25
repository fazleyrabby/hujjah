use serde::{Deserialize, Serialize};
use crate::ai::hardware::HardwareProfile;

/// Model tiers mapped to hardware capabilities.
/// This is isolated logic — no downloads, no execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ModelTier {
    /// 0.5B parameters, ~500MB RAM
    /// Safe for most devices
    Lite,
    /// 1.5B parameters, ~1.2GB RAM
    /// Requires 4GB+ available RAM
    Standard,
    /// 3B+ parameters, ~2.5GB RAM
    /// Requires 6GB+ available RAM (desktop only)
    Research,
}

impl ModelTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            ModelTier::Lite => "lite",
            ModelTier::Standard => "standard",
            ModelTier::Research => "research",
        }
    }

    pub fn ram_requirement_gb(&self) -> f64 {
        match self {
            ModelTier::Lite => 1.5,
            ModelTier::Standard => 3.0,
            ModelTier::Research => 5.0,
        }
    }
}

/// Safety margin for model RAM overhead (Transformers.js / ONNX overhead).
const SAFETY_MARGIN_GB: f64 = 1.5;

/// Select the appropriate model tier based on available RAM.
/// Uses AVAILABLE RAM, not total RAM, with a safety margin.
pub fn select_model_tier(profile: &HardwareProfile) -> ModelTier {
    let usable_ram = (profile.available_ram_gb - SAFETY_MARGIN_GB).max(0.0);

    log::info!(
        "[ModelSelector] Available: {:.1}GB, Usable (with {}GB margin): {:.1}GB",
        profile.available_ram_gb,
        SAFETY_MARGIN_GB,
        usable_ram
    );

    let tier = if usable_ram >= ModelTier::Research.ram_requirement_gb() {
        ModelTier::Research
    } else if usable_ram >= ModelTier::Standard.ram_requirement_gb() {
        ModelTier::Standard
    } else {
        ModelTier::Lite
    };

    log::info!("[ModelSelector] Selected tier: {:?}", tier);
    tier
}

#[tauri::command]
pub fn select_model_tier_cmd(profile: HardwareProfile) -> String {
    let tier = select_model_tier(&profile);
    tier.as_str().to_string()
}
