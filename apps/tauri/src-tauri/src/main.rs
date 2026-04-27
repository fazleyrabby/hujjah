#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Enable panic logging for debugging
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("PANIC: {:?}", panic_info);
    }));
    
    hujjah_lib::run();
}
