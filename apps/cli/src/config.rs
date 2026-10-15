use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};

const CREDENTIAL_SERVICE: &str = "app.lunaris.cli";
const DEFAULT_BASE_URL: &str = "https://api-us.lunaris.app";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub current_server: String,
    pub schema_version: u32,
    pub servers: BTreeMap<String, ConfiguredServer>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            current_server: "us".into(),
            schema_version: 2,
            servers: BTreeMap::from([(
                "us".into(),
                ConfiguredServer {
                    api_url: DEFAULT_BASE_URL.into(),
                    auth: ServerAuth::OAuth,
                    display_name: "United States".into(),
                    manifest_url: None,
                    organization: None,
                },
            )]),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfiguredServer {
    pub api_url: String,
    pub auth: ServerAuth,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub organization: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServerAuth {
    DesktopPairing,
    #[serde(rename = "oauth")]
    OAuth,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum StoredCredential {
    #[serde(rename = "api-key")]
    ApiKey { api_key: String },
    #[serde(rename = "desktop")]
    Desktop {
        client_id: String,
        scopes: Vec<String>,
        token: String,
    },
    #[serde(rename = "oauth")]
    OAuth {
        access_token: String,
        client_id: String,
        expires_at: i64,
        issuer: String,
        refresh_token: Option<String>,
        resource: String,
        scopes: Vec<String>,
        token_endpoint: String,
    },
}

pub fn load() -> Result<Config, String> {
    load_from(&config_path())
}

pub fn load_from(path: &Path) -> Result<Config, String> {
    match fs::read_to_string(path) {
        Ok(value) => {
            let config = serde_json::from_str::<Config>(&value)
                .map_err(|error| format!("Invalid Lunaris config: {error}"))?;
            if config.schema_version != 2 {
                return Err(format!(
                    "Unsupported Lunaris config schema: {}",
                    config.schema_version
                ));
            }
            Ok(config)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(error) => Err(format!("Unable to read Lunaris config: {error}")),
    }
}

pub fn save(config: &Config) -> Result<(), String> {
    save_to(&config_path(), config)
}

pub fn save_to(path: &Path, config: &Config) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Lunaris config path has no parent".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create Lunaris config directory: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let value = format!(
        "{}\n",
        serde_json::to_string_pretty(config)
            .map_err(|error| format!("Unable to encode Lunaris config: {error}"))?
    );
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| format!("Unable to write Lunaris config: {error}"))?;
    file.write_all(value.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|error| format!("Unable to write Lunaris config: {error}"))?;
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Unable to replace Lunaris config: {error}"))?;
    }
    fs::rename(&temporary, path)
        .map_err(|error| format!("Unable to replace Lunaris config: {error}"))
}

pub fn selected(
    config: &Config,
    server_id: Option<&str>,
) -> Result<(String, ConfiguredServer), String> {
    let id = server_id.unwrap_or(&config.current_server);
    let server = config
        .servers
        .get(id)
        .cloned()
        .ok_or_else(|| format!("Unknown server: {id}"))?;
    Ok((id.to_owned(), server))
}

pub fn read_credential(
    server_id: &str,
    allow_environment: bool,
) -> Result<Option<StoredCredential>, String> {
    if allow_environment {
        if let Ok(api_key) = std::env::var("LUNARIS_API_KEY") {
            if !api_key.is_empty() {
                return Ok(Some(StoredCredential::ApiKey { api_key }));
            }
        }
    }
    let entry = credential_entry(server_id)?;
    let value = match entry.get_password() {
        Ok(value) => value,
        Err(KeyringError::NoEntry) => return Ok(None),
        Err(_) => return Err("Unable to read Lunaris credential store".into()),
    };
    parse_credential(value).map(Some)
}

fn parse_credential(value: String) -> Result<StoredCredential, String> {
    if value.trim_start().starts_with('{') {
        serde_json::from_str(&value)
            .map_err(|_| "Stored credential is invalid. Run `lunaris auth login` again.".into())
    } else {
        Ok(StoredCredential::ApiKey { api_key: value })
    }
}

pub fn write_credential(server_id: &str, credential: &StoredCredential) -> Result<(), String> {
    let value = match credential {
        StoredCredential::ApiKey { api_key } => api_key.clone(),
        _ => serde_json::to_string(credential)
            .map_err(|error| format!("Unable to encode Lunaris credential: {error}"))?,
    };
    credential_entry(server_id)?
        .set_password(&value)
        .map_err(|_| "Unable to save Lunaris credential".into())
}

pub fn delete_credential(server_id: &str) -> Result<(), String> {
    match credential_entry(server_id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Unable to delete Lunaris credential".into()),
    }
}

fn credential_entry(server_id: &str) -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, server_id)
        .map_err(|_| "Unable to access Lunaris credential store".into())
}

fn config_path() -> PathBuf {
    if let Some(path) = std::env::var_os("LUNARIS_CONFIG_PATH") {
        return PathBuf::from(path);
    }
    let root = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        root.join("Lunaris/config.json")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        root.join("lunaris/config.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_round_trips_without_credentials() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("config.json");
        let mut config = Config::default();
        config.servers.get_mut("us").unwrap().organization = Some("ws-1".into());
        save_to(&path, &config).unwrap();
        let loaded = load_from(&path).unwrap();
        assert_eq!(loaded.current_server, "us");
        assert_eq!(loaded.servers["us"].organization.as_deref(), Some("ws-1"));
        assert!(!fs::read_to_string(path).unwrap().contains("accessToken"));
    }

    #[test]
    fn reads_oauth_credential_with_resource() {
        let value = r#"{"kind":"oauth","accessToken":"token","clientId":"client","expiresAt":123,"issuer":"https://api.example","resource":"https://api.example","scopes":["openid"],"tokenEndpoint":"https://api.example/token"}"#;
        let parsed = parse_credential(value.into()).unwrap();
        assert!(matches!(parsed, StoredCredential::OAuth { .. }));
    }

    #[test]
    fn rejects_oauth_credential_without_resource() {
        let value = r#"{"kind":"oauth","accessToken":"token","clientId":"client","expiresAt":123,"issuer":"https://api.example","scopes":["openid"],"tokenEndpoint":"https://api.example/token"}"#;
        assert_eq!(
            parse_credential(value.into()).unwrap_err(),
            "Stored credential is invalid. Run `lunaris auth login` again."
        );
    }

    #[test]
    fn rejects_malformed_structured_credentials() {
        assert!(parse_credential("  {invalid".into()).is_err());
    }

    #[test]
    fn reads_raw_api_key() {
        assert!(matches!(
            parse_credential("test-api-key".into()).unwrap(),
            StoredCredential::ApiKey { api_key } if api_key == "test-api-key"
        ));
    }

    #[test]
    fn reads_existing_typescript_server_auth() {
        let value = r#"{"apiUrl":"https://api.example","auth":"oauth","displayName":"Example"}"#;
        let parsed = serde_json::from_str::<ConfiguredServer>(value).unwrap();
        assert_eq!(parsed.auth, ServerAuth::OAuth);
    }

    #[test]
    fn ignores_retired_workspace_default() {
        let value = r#"{"apiUrl":"https://api.example","auth":"oauth","displayName":"Example","workspace":"org-1"}"#;
        let parsed = serde_json::from_str::<ConfiguredServer>(value).unwrap();
        assert!(parsed.organization.is_none());
        assert!(!serde_json::to_string(&parsed)
            .unwrap()
            .contains("workspace"));
    }
}
