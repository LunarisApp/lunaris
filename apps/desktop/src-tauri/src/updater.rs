#[tauri::command]
pub fn desktop_updater_enabled(app: tauri::AppHandle) -> bool {
    // Linux's updater replaces AppImages; package-managed installs use their package manager.
    let supported = !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some();
    !cfg!(debug_assertions)
        && supported
        && app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|config| config.get("pubkey"))
            .and_then(|key| key.as_str())
            .is_some_and(|key| !key.is_empty())
}
