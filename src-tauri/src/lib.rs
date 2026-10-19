use keyring::Entry;

/// Validate that a key_id looks like a UUID (basic hex-dash pattern).
fn is_valid_uuid(s: &str) -> bool {
    let s = s.trim();
    if s.len() != 36 { return false; }
    s.chars().enumerate().all(|(i, c)| {
        if i == 8 || i == 13 || i == 18 || i == 23 { c == '-' }
        else { c.is_ascii_hexdigit() }
    })
}

#[tauri::command]
fn save_api_key(key_id: String, key_value: String) -> Result<(), String> {
    if !is_valid_uuid(&key_id) {
        return Err("Invalid key ID format.".to_string());
    }
    if key_value.len() > 256 {
        return Err("API key value exceeds maximum length.".to_string());
    }
    let entry = Entry::new("keylooper", &key_id)
        .map_err(|e| format!("Failed to initialize keyring entry: {}", e))?;
    entry
        .set_password(&key_value)
        .map_err(|e| format!("Failed to save key to OS keyring: {}", e))?;

    // Clean up legacy keychain entry if it exists
    if let Ok(legacy_entry) = Entry::new("apkirota", &key_id) {
        let _ = legacy_entry.delete_credential();
    }

    Ok(())
}

#[tauri::command]
fn load_api_key(key_id: String) -> Result<String, String> {
    if !is_valid_uuid(&key_id) {
        return Err("Invalid key ID format.".to_string());
    }
    if let Ok(entry) = Entry::new("keylooper", &key_id) {
        if let Ok(pass) = entry.get_password() {
            if !pass.is_empty() {
                return Ok(pass);
            }
        }
    }

    // Fallback to legacy keychain
    if let Ok(entry) = Entry::new("apkirota", &key_id) {
        if let Ok(pass) = entry.get_password() {
            if !pass.is_empty() {
                // Migrate to new keychain
                if let Ok(new_entry) = Entry::new("keylooper", &key_id) {
                    let _ = new_entry.set_password(&pass);
                }
                return Ok(pass);
            }
        }
    }

    Ok("".to_string())
}

#[tauri::command]
fn delete_api_key(key_id: String) -> Result<(), String> {
    if !is_valid_uuid(&key_id) {
        return Err("Invalid key ID format.".to_string());
    }
    let entry = Entry::new("keylooper", &key_id).map_err(|e| format!("Keyring error: {}", e))?;
    let _ = entry.delete_credential();

    if let Ok(legacy_entry) = Entry::new("apkirota", &key_id) {
        let _ = legacy_entry.delete_credential();
    }

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AgentFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

fn validate_and_resolve_path(
    workspace: &str,
    relative: &str,
) -> Result<std::path::PathBuf, String> {
    let ws_path = std::path::Path::new(workspace);
    if !ws_path.exists() {
        return Err(format!("Workspace path does not exist: {}", workspace));
    }
    let base = std::fs::canonicalize(ws_path)
        .map_err(|e| format!("Invalid workspace directory: {}", e))?;

    let rel_clean = relative
        .trim_start_matches(|c| c == '/' || c == '\\')
        .replace('/', std::path::MAIN_SEPARATOR_STR);

    let target = if rel_clean.is_empty() {
        base.clone()
    } else {
        base.join(rel_clean)
    };

    if target.exists() {
        let canonical_target = std::fs::canonicalize(&target)
            .map_err(|e| format!("Path resolution error: {}", e))?;
        if !canonical_target.starts_with(&base) {
            return Err("Access denied: path is outside the allowed workspace directory.".to_string());
        }
        Ok(canonical_target)
    } else {
        let parent = target.parent().ok_or("Invalid file path: no parent")?;
        if parent.exists() {
            let canonical_parent = std::fs::canonicalize(parent)
                .map_err(|e| format!("Path resolution error: {}", e))?;
            if !canonical_parent.starts_with(&base) {
                return Err("Access denied: path is outside the allowed workspace directory.".to_string());
            }
        }
        Ok(target)
    }
}

fn copy_dir_recursive(
    src: &std::path::Path,
    dst: &std::path::Path,
    backup_root: &std::path::Path,
) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        if path == backup_root || path.to_string_lossy().contains("__BACKUP_FOLDER") {
            continue;
        }
        let dest_child = dst.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&path, &dest_child, backup_root)?;
        } else {
            std::fs::copy(&path, &dest_child)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn agent_create_backup(workspace_path: String) -> Result<String, String> {
    let ws_path = std::path::Path::new(&workspace_path);
    if !ws_path.is_dir() {
        return Err("Workspace path must be a valid directory.".to_string());
    }

    let parent = ws_path
        .parent()
        .ok_or_else(|| "Cannot create backup for a root drive directory.".to_string())?;

    let folder_name = ws_path
        .file_name()
        .ok_or_else(|| "Invalid directory name.".to_string())?
        .to_string_lossy();

    let backup_folder_name = format!("{}__{}", folder_name, "BACKUP_FOLDER");
    let backup_path = parent.join(&backup_folder_name);

    copy_dir_recursive(ws_path, &backup_path, &backup_path)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    Ok(backup_path.to_string_lossy().to_string())
}

#[tauri::command]
fn agent_list_directory(
    workspace_path: String,
    subpath: Option<String>,
) -> Result<Vec<AgentFileItem>, String> {
    let rel = subpath.unwrap_or_default();
    let dir = validate_and_resolve_path(&workspace_path, &rel)?;
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory.", rel));
    }

    let base = std::fs::canonicalize(&workspace_path)
        .map_err(|e| format!("Workspace error: {}", e))?;

    let mut items = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip internal backup folders to prevent confusion
        if name.contains("__BACKUP_FOLDER") {
            continue;
        }

        let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let size = if is_dir {
            0
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };

        let rel_display = path
            .strip_prefix(&base)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());

        items.push(AgentFileItem {
            name,
            path: rel_display,
            is_dir,
            size,
        });
    }

    items.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(items)
}

#[tauri::command]
fn agent_read_file(workspace_path: String, rel_path: String) -> Result<String, String> {
    let file_path = validate_and_resolve_path(&workspace_path, &rel_path)?;
    if !file_path.is_file() {
        return Err(format!("'{}' is not a file.", rel_path));
    }

    let metadata = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("File exceeds 5MB limit for text agent reading.".to_string());
    }

    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file '{}': {}", rel_path, e))
}

#[tauri::command]
fn agent_write_file(
    workspace_path: String,
    rel_path: String,
    content: String,
) -> Result<(), String> {
    let target_path = validate_and_resolve_path(&workspace_path, &rel_path)?;

    if let Some(parent) = target_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }
    }

    std::fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("Failed to write file '{}': {}", rel_path, e))
}

#[tauri::command]
fn agent_restore_backup(workspace_path: String) -> Result<String, String> {
    let ws_path = std::path::Path::new(&workspace_path);
    if !ws_path.is_dir() {
        return Err("Workspace path must be a valid directory.".to_string());
    }

    let parent = ws_path
        .parent()
        .ok_or_else(|| "Cannot restore backup for a root drive directory.".to_string())?;

    let folder_name = ws_path
        .file_name()
        .ok_or_else(|| "Invalid directory name.".to_string())?
        .to_string_lossy();

    let backup_folder_name = format!("{}__{}", folder_name, "BACKUP_FOLDER");
    let backup_path = parent.join(&backup_folder_name);

    if !backup_path.exists() {
        return Err(format!("Backup folder does not exist at '{}'.", backup_path.display()));
    }

    copy_dir_recursive(&backup_path, ws_path, &backup_path)
        .map_err(|e| format!("Failed to restore backup: {}", e))?;

    Ok(format!("Successfully restored workspace from '{}'", backup_path.display()))
}

#[tauri::command]
async fn open_gemini_web_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("gemini-web") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = tauri::Url::parse("https://gemini.google.com/app")
        .map_err(|e| format!("Invalid URL: {}", e))?;

    tauri::WebviewWindowBuilder::new(
        &app,
        "gemini-web",
        tauri::WebviewUrl::External(url),
    )
    .title("Google Gemini")
    .inner_size(1024.0, 768.0)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
    .devtools(true)
    .build()
    .map_err(|e| format!("Failed to create Gemini Web window: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Emitter;
                use tauri::Manager;

                let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;

                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            app.exit(0);
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit("open-settings", ());
                        }
                        _ => {}
                    });

                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }

                tray_builder.build(app)?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            load_api_key,
            delete_api_key,
            agent_create_backup,
            agent_list_directory,
            agent_read_file,
            agent_write_file,
            agent_restore_backup,
            open_gemini_web_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
