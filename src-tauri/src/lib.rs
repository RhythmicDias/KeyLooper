use keyring::Entry;
use tauri::Manager;

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
fn agent_rename_file(
    workspace_path: String,
    old_rel_path: String,
    new_rel_path: String,
) -> Result<(), String> {
    let src = validate_and_resolve_path(&workspace_path, &old_rel_path)?;
    let dst = validate_and_resolve_path(&workspace_path, &new_rel_path)?;

    if !src.exists() {
        return Err(format!("Source path '{}' does not exist.", old_rel_path));
    }

    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directories: {}", e))?;
        }
    }

    std::fs::rename(&src, &dst)
        .map_err(|e| format!("Failed to rename '{}' to '{}': {}", old_rel_path, new_rel_path, e))
}

#[tauri::command]
fn agent_delete_file(
    workspace_path: String,
    rel_path: String,
) -> Result<(), String> {
    let target = validate_and_resolve_path(&workspace_path, &rel_path)?;
    if !target.exists() {
        return Err(format!("Path '{}' does not exist.", rel_path));
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("Failed to delete directory '{}': {}", rel_path, e))
    } else {
        std::fs::remove_file(&target)
            .map_err(|e| format!("Failed to delete file '{}': {}", rel_path, e))
    }
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

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct GeminiFileUploadResponse {
    pub file_uri: String,
    pub mime_type: String,
}

#[tauri::command]
async fn upload_file_to_gemini(
    api_key: String,
    display_name: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<GeminiFileUploadResponse, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key is required for upload.".to_string());
    }

    let init_url = format!(
        "https://generativelanguage.googleapis.com/upload/v1beta/files?key={}",
        key
    );

    let client = reqwest::Client::new();
    let init_res = client
        .post(&init_url)
        .header("Content-Type", "application/json")
        .header("X-Goog-Upload-Protocol", "resumable")
        .header("X-Goog-Upload-Command", "start")
        .header("X-Goog-Upload-Header-Content-Length", data.len().to_string())
        .header("X-Goog-Upload-Header-Content-Type", &mime_type)
        .json(&serde_json::json!({
            "file": {
                "display_name": display_name
            }
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to initiate upload session: {}", e))?;

    if !init_res.status().is_success() {
        let err = init_res.text().await.unwrap_or_default();
        return Err(format!("Upload initiation failed: {}", err));
    }

    let upload_url = init_res
        .headers()
        .get("x-goog-upload-url")
        .or_else(|| init_res.headers().get("X-Goog-Upload-Url"))
        .ok_or_else(|| "Gemini server did not return an upload session URL.".to_string())?
        .to_str()
        .map_err(|e| format!("Invalid upload URL header: {}", e))?
        .to_string();

    let upload_res = client
        .post(&upload_url)
        .header("Content-Length", data.len().to_string())
        .header("X-Goog-Upload-Offset", "0")
        .header("X-Goog-Upload-Command", "upload, finalize")
        .header("Content-Type", &mime_type)
        .body(data)
        .send()
        .await
        .map_err(|e| format!("File upload transfer failed: {}", e))?;

    if !upload_res.status().is_success() {
        let err = upload_res.text().await.unwrap_or_default();
        return Err(format!("Gemini file upload failed: {}", err));
    }

    let res_json: serde_json::Value = upload_res
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini upload response: {}", e))?;

    let file_uri = res_json["file"]["uri"]
        .as_str()
        .ok_or_else(|| "Missing file URI in Gemini response.".to_string())?
        .to_string();

    let returned_mime = res_json["file"]["mimeType"]
        .as_str()
        .unwrap_or(&mime_type)
        .to_string();

    Ok(GeminiFileUploadResponse {
        file_uri,
        mime_type: returned_mime,
    })
}

#[tauri::command]
fn save_custom_skills(app: tauri::AppHandle, skills_json: String) -> Result<(), String> {
    use std::fs;
    use tauri::Manager;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    let path = app_dir.join("custom_skills.json");
    fs::write(path, skills_json).map_err(|e| format!("Failed to write skills: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_custom_skills(app: tauri::AppHandle) -> Result<String, String> {
    use std::fs;
    use tauri::Manager;
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let path = app_dir.join("custom_skills.json");
    if path.exists() {
        fs::read_to_string(path).map_err(|e| format!("Failed to read skills: {}", e))
    } else {
        Ok("[]".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
fn hide_to_tray(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
}

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

                let show_i = MenuItem::with_id(app, "show", "Open KeyLooper", true, None::<&str>)?;
                let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &settings_i, &quit_i])?;

                let tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit("open-settings", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    });

                let tray_icon = match tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")) {
                    Ok(img) => img,
                    Err(_) => app
                        .default_window_icon()
                        .cloned()
                        .expect("Failed to load application icon for system tray"),
                };

                let _tray = tray_builder
                    .icon(tray_icon)
                    .tooltip("KeyLooper")
                    .show_menu_on_left_click(false)
                    .build(app)?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            load_api_key,
            delete_api_key,
            agent_create_backup,
            agent_list_directory,
            agent_read_file,
            agent_write_file,
            agent_rename_file,
            agent_delete_file,
            agent_restore_backup,
            open_gemini_web_window,
            upload_file_to_gemini,
            save_custom_skills,
            load_custom_skills,
            hide_to_tray,
            show_main_window
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
