// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    {
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let arg = "--disable-features=HideCursorWhileTyping";
        if !existing.contains(arg) {
            let new_args = if existing.is_empty() {
                arg.to_string()
            } else {
                format!("{} {}", existing, arg)
            };
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", new_args);
        }
    }

    tauri_app_lib::run()
}
