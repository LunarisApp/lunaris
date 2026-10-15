mod api;
mod connector;
mod cookies;
mod target;
mod upload;

use powersync::SyncOptions;
use reqwest::Client;
use tauri::{AppHandle, Runtime};
use tauri_plugin_powersync::PowerSyncExt;

use crate::auth_keys::is_valid_region_id;
use connector::LunarisConnector;
use target::{database_paths, validate_api_url};

#[tauri::command]
pub async fn powersync_connect<R: Runtime>(
    app: AppHandle<R>,
    handle: usize,
    region_id: String,
    api_url: String,
) -> Result<(), String> {
    if !is_valid_region_id(&region_id) {
        return Err("invalid region ID".into());
    }
    let api_url = validate_api_url(&api_url, cfg!(debug_assertions))?;
    let database = app
        .powersync()
        .database_from_javascript_handle(handle)
        .map_err(|error| error.to_string())?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())?;
    let connector =
        LunarisConnector::new(api_url, app, client, database.clone(), handle, region_id);
    database.connect(SyncOptions::new(connector)).await;
    Ok(())
}

#[tauri::command]
pub fn powersync_delete_database<R: Runtime>(
    app: AppHandle<R>,
    storage_name: String,
) -> Result<(), String> {
    for path in database_paths(&app, &storage_name)? {
        match std::fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}

#[tauri::command]
pub fn powersync_database_size<R: Runtime>(
    app: AppHandle<R>,
    storage_name: String,
) -> Result<u64, String> {
    database_paths(&app, &storage_name)?
        .into_iter()
        .try_fold(0_u64, |total, path| match std::fs::metadata(path) {
            Ok(metadata) => Ok(total + metadata.len()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(total),
            Err(error) => Err(error.to_string()),
        })
}
