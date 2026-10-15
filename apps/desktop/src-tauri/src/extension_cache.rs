use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

fn replace_file(path: &Path, temporary: &Path) -> Result<(), String> {
    match std::fs::rename(temporary, path) {
        Ok(()) => Ok(()),
        Err(_) if path.exists() => {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
            std::fs::rename(temporary, path).map_err(|error| error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}

fn cache_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    if key.is_empty() || key.len() > 4096 {
        return Err("invalid extension cache key".into());
    }
    let digest = Sha256::digest(key.as_bytes());
    let name = format!("{:x}.bin", digest);
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("plugin-cache-v1")
        .join(name))
}

#[tauri::command]
pub async fn extension_cache_get(app: AppHandle, key: String) -> Result<Option<Vec<u8>>, String> {
    let path = cache_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || match std::fs::read(path) {
        Ok(value) => Ok(Some(value)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn extension_cache_put(
    app: AppHandle,
    key: String,
    value: Vec<u8>,
) -> Result<(), String> {
    let path = cache_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || {
        let directory = path
            .parent()
            .ok_or_else(|| "extension cache path has no parent".to_string())?;
        std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        let temporary = directory.join(format!(".{}.tmp", rand::random::<u64>()));
        std::fs::write(&temporary, value).map_err(|error| error.to_string())?;
        match replace_file(&path, &temporary) {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = std::fs::remove_file(temporary);
                Err(error)
            }
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn extension_cache_delete(app: AppHandle, key: String) -> Result<(), String> {
    let path = cache_path(&app, &key)?;
    tauri::async_runtime::spawn_blocking(move || match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::replace_file;

    #[test]
    fn replaces_existing_cache_file() {
        let directory = std::env::temp_dir().join(format!(
            "lunaris-extension-cache-test-{}",
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("cache.bin");
        let temporary = directory.join("cache.tmp");
        std::fs::write(&path, b"old").unwrap();
        std::fs::write(&temporary, b"new").unwrap();

        replace_file(&path, &temporary).unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        assert!(!temporary.exists());
        std::fs::remove_dir_all(directory).unwrap();
    }
}
