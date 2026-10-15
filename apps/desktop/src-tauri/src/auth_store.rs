use keyring::{Entry, Error};

use crate::auth_keys::is_allowed_key;

const SERVICE: &str = "app.lunaris.desktop";

fn entry(key: &str) -> Result<Entry, String> {
    if !is_allowed_key(key) {
        return Err("auth secret key is not allowed".into());
    }
    Entry::new(SERVICE, key).map_err(|error| error.to_string())
}

pub(crate) fn secret_get(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub(crate) fn secret_set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn auth_secret_get(key: String) -> Result<Option<String>, String> {
    secret_get(&key)
}

#[tauri::command]
pub fn auth_secret_set(key: String, value: String) -> Result<(), String> {
    secret_set(&key, &value)
}
