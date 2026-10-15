use std::path::PathBuf;

use powersync::error::PowerSyncError;
use tauri::{AppHandle, Manager, Runtime};
use url::Url;

pub(super) fn powersync_error(message: impl Into<String>) -> PowerSyncError {
    serde_json::Error::io(std::io::Error::other(message.into())).into()
}

pub(super) fn validate_api_url(value: &str, debug: bool) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "invalid region API URL")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("invalid region API URL".into());
    }
    let host = url.host_str().ok_or("invalid region API URL")?;
    let release_host = host.ends_with(".lunaris.app") && url.port().is_none();
    let debug_loopback = debug
        && url.scheme() == "http"
        && matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
    if (url.scheme() == "https" && release_host) || debug_loopback {
        Ok(url)
    } else {
        Err("region API URL is not allowed".into())
    }
}

pub(super) fn validate_powersync_url(value: &str, debug: bool) -> Result<String, PowerSyncError> {
    let url = Url::parse(value).map_err(|_| powersync_error("invalid PowerSync URL"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(powersync_error("invalid PowerSync URL"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| powersync_error("invalid PowerSync URL"))?;
    let debug_loopback = debug
        && url.scheme() == "http"
        && matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1");
    if url.scheme() != "https" && !debug_loopback {
        return Err(powersync_error("PowerSync URL must use HTTPS"));
    }
    Ok(url.to_string())
}

fn validated_database_name(value: &str) -> Result<&str, String> {
    let hash = value
        .strip_prefix("lunaris.v2.")
        .and_then(|name| name.strip_suffix(".db"))
        .ok_or("invalid PowerSync database name")?;
    if hash.len() == 16
        && hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        Ok(value)
    } else {
        Err("invalid PowerSync database name".into())
    }
}

pub(super) fn database_paths<R: Runtime>(
    app: &AppHandle<R>,
    storage_name: &str,
) -> Result<Vec<PathBuf>, String> {
    let name = validated_database_name(storage_name)?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(["", "-wal", "-shm", "-journal"]
        .into_iter()
        .map(|suffix| directory.join(format!("{name}{suffix}")))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{validate_api_url, validate_powersync_url, validated_database_name};

    #[test]
    fn validates_release_and_debug_api_targets() {
        assert!(validate_api_url("https://eu.lunaris.app", false).is_ok());
        assert!(validate_api_url("http://localhost:3000", true).is_ok());
        assert!(validate_api_url("http://localhost:3000", false).is_err());
        assert!(validate_api_url("https://lunaris.app.evil.test", false).is_err());
        assert!(validate_api_url("https://user@eu.lunaris.app", false).is_err());
    }

    #[test]
    fn validates_powersync_transport_targets() {
        assert!(validate_powersync_url("https://sync.example.com/path", false).is_ok());
        assert!(validate_powersync_url("http://localhost:8080", true).is_ok());
        assert!(validate_powersync_url("http://localhost:8080", false).is_err());
        assert!(validate_powersync_url("https://user@sync.example.com", false).is_err());
        assert!(validate_powersync_url("https://sync.example.com?q=secret", false).is_err());
    }

    #[test]
    fn validates_only_user_database_basenames() {
        assert!(validated_database_name("lunaris.v2.0123456789abcdef.db").is_ok());
        assert!(validated_database_name("lunaris.v2.0123456789ABCDEf.db").is_err());
        assert!(validated_database_name("../lunaris.v2.0123456789abcdef.db").is_err());
        assert!(validated_database_name("lunaris.v2.short.db").is_err());
    }
}
