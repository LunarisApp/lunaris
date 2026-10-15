use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use url::Url;

use crate::config::{ConfiguredServer, ServerAuth};

pub const DEFAULT_SERVER_DIRECTORY_URL: &str = "https://lunaris.app/.well-known/lunaris-servers";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerManifest {
    pub api_url: String,
    pub auth: ServerAuth,
    pub display_name: String,
    pub schema_version: u32,
    pub server_id: String,
}

impl ServerManifest {
    pub fn configured(&self, organization: Option<String>) -> ConfiguredServer {
        ConfiguredServer {
            api_url: self.api_url.clone(),
            auth: self.auth.clone(),
            display_name: self.display_name.clone(),
            manifest_url: Url::parse(&self.api_url)
                .ok()
                .and_then(|url| url.join("/v1/manifest").ok())
                .map(Into::into),
            organization,
        }
    }

    fn validate(self) -> Result<Self, String> {
        if self.schema_version != 1 || self.server_id.is_empty() || self.display_name.is_empty() {
            return Err("Lunaris server returned an invalid manifest".into());
        }
        let api_url = control_url(&self.api_url)?;
        if self.auth == ServerAuth::DesktopPairing && !is_loopback_http(&api_url) {
            return Err("Desktop credentials are restricted to loopback servers".into());
        }
        Ok(self)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerDirectory {
    pub schema_version: u32,
    pub servers: Vec<DirectoryServer>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryServer {
    pub display_name: String,
    pub manifest_url: Option<String>,
    pub server_id: String,
    pub status: String,
}

impl ServerDirectory {
    fn validate(self) -> Result<Self, String> {
        if self.schema_version != 1 {
            return Err("Lunaris server directory schema is unsupported".into());
        }
        let mut server_ids = HashSet::new();
        for server in &self.servers {
            if server.server_id.is_empty()
                || server.display_name.is_empty()
                || !server_ids.insert(server.server_id.as_str())
                || !matches!(server.status.as_str(), "available" | "planned")
            {
                return Err("Lunaris server directory returned an invalid response".into());
            }
            match (&server.status[..], server.manifest_url.as_deref()) {
                ("available", Some(manifest_url)) => {
                    secure_url(manifest_url)
                        .map_err(|_| "Lunaris server directory returned an invalid response")?;
                }
                ("available", None) => {
                    return Err("Lunaris server directory returned an invalid response".into());
                }
                ("planned", Some(manifest_url)) => {
                    secure_url(manifest_url)
                        .map_err(|_| "Lunaris server directory returned an invalid response")?;
                }
                ("planned", None) => {}
                _ => unreachable!("status was validated"),
            }
        }
        Ok(self)
    }
}

pub async fn discover_manifest(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<ServerManifest, String> {
    let base = control_url(base_url)?;
    let manifest_url = base
        .join("/v1/manifest")
        .map_err(|_| "Lunaris server URL is invalid".to_owned())?;
    fetch_manifest(client, manifest_url, None).await
}

pub async fn discover_manifest_url(
    client: &reqwest::Client,
    manifest_url: Url,
    expected_server: Option<&str>,
) -> Result<ServerManifest, String> {
    fetch_manifest(client, manifest_url, expected_server).await
}

pub async fn discover_directory(
    client: &reqwest::Client,
    directory_url: &str,
) -> Result<ServerDirectory, String> {
    let url = secure_url(directory_url)?;
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| "Unable to connect to the Lunaris server directory".to_owned())?;
    if !response.status().is_success() {
        return Err(format!(
            "Unable to connect to the Lunaris server directory: {}",
            response.status().as_u16()
        ));
    }
    let directory = response
        .json::<ServerDirectory>()
        .await
        .map_err(|_| "Lunaris server directory returned an invalid response".to_owned())?;
    directory.validate()
}

pub async fn discover_desktop(client: &reqwest::Client) -> Result<(ServerManifest, Url), String> {
    for path in descriptor_paths() {
        let Ok(value) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(descriptor) = serde_json::from_str::<DesktopDescriptor>(&value) else {
            continue;
        };
        if descriptor.schema_version != 1 {
            continue;
        }
        let Ok(url) = Url::parse(&descriptor.manifest_url) else {
            continue;
        };
        if !is_loopback_http(&url) {
            continue;
        }
        if let Ok(manifest) = fetch_manifest(client, url.clone(), Some("desktop")).await {
            if manifest.auth == ServerAuth::DesktopPairing {
                return Ok((manifest, url));
            }
        }
    }
    Err(
        "Lunaris Desktop is unavailable. Start Desktop and enable Agent access in Settings → Local Data."
            .into(),
    )
}

pub async fn discover_servers(
    client: &reqwest::Client,
    directory_url: &str,
) -> Result<Vec<DirectoryServer>, String> {
    let (remote, desktop) = tokio::join!(
        discover_directory(client, directory_url),
        discover_desktop(client)
    );
    let mut servers = match remote {
        Ok(directory) => directory.servers,
        Err(error) if desktop.is_err() => return Err(error),
        Err(_) => Vec::new(),
    };
    if let Ok((manifest, manifest_url)) = desktop {
        servers.retain(|server| server.server_id != "desktop");
        servers.push(DirectoryServer {
            display_name: manifest.display_name,
            manifest_url: Some(manifest_url.into()),
            server_id: manifest.server_id,
            status: "available".into(),
        });
    }
    Ok(servers)
}

pub async fn resolve_directory_server(
    client: &reqwest::Client,
    server: &DirectoryServer,
) -> Result<ServerManifest, String> {
    if server.status != "available" {
        return Err(format!(
            "Lunaris server is unavailable: {}",
            server.server_id
        ));
    }
    let manifest_url = server
        .manifest_url
        .as_deref()
        .ok_or_else(|| format!("Lunaris server has no manifest: {}", server.server_id))?;
    discover_manifest_url(client, secure_url(manifest_url)?, Some(&server.server_id)).await
}

pub async fn resolve_server(
    client: &reqwest::Client,
    server_id: &str,
    directory_url: &str,
) -> Result<ServerManifest, String> {
    if server_id == "desktop" {
        return discover_desktop(client).await.map(|value| value.0);
    }
    let directory = discover_directory(client, directory_url).await?;
    let server = directory
        .servers
        .into_iter()
        .find(|server| server.server_id == server_id && server.status == "available")
        .ok_or_else(|| format!("Lunaris server is unavailable: {server_id}"))?;
    resolve_directory_server(client, &server).await
}

pub fn http_client(timeout_ms: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| format!("Unable to create HTTP client: {error}"))
}

pub fn control_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Lunaris server URL is invalid".to_owned())?;
    if url.username() != "" || url.password().is_some() || url.fragment().is_some() {
        return Err("Lunaris server URL contains unsupported credentials or fragment".into());
    }
    if url.scheme() != "https" && !is_loopback_http(&url) {
        return Err("Lunaris server URLs must use HTTPS, except on localhost".into());
    }
    Ok(url)
}

pub fn secure_url(value: &str) -> Result<Url, String> {
    control_url(value)
}

pub fn is_loopback_http(url: &Url) -> bool {
    url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
        && url.username().is_empty()
        && url.password().is_none()
}

async fn fetch_manifest(
    client: &reqwest::Client,
    manifest_url: Url,
    expected_server: Option<&str>,
) -> Result<ServerManifest, String> {
    if manifest_url.scheme() != "https" && !is_loopback_http(&manifest_url) {
        return Err("Lunaris manifest URLs must use HTTPS, except on localhost".into());
    }
    let response = client
        .get(manifest_url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|_| "Unable to connect to the Lunaris server manifest".to_owned())?;
    if !response.status().is_success() {
        return Err(format!(
            "Unable to connect to the Lunaris server manifest: {}",
            response.status().as_u16()
        ));
    }
    let manifest = response
        .json::<ServerManifest>()
        .await
        .map_err(|_| "Lunaris server returned an invalid manifest".to_owned())?
        .validate()?;
    if expected_server.is_some_and(|expected| expected != manifest.server_id) {
        return Err(format!(
            "Server manifest mismatch: expected {}, got {}",
            expected_server.unwrap_or_default(),
            manifest.server_id
        ));
    }
    Ok(manifest)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDescriptor {
    manifest_url: String,
    schema_version: u32,
}

fn descriptor_paths() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let root = dirs::home_dir()
            .unwrap_or_default()
            .join("Library/Application Support");
        vec![
            root.join("app.lunaris/server.json"),
            root.join("Lunaris/server.json"),
        ]
    }
    #[cfg(target_os = "windows")]
    {
        let root = dirs::config_dir().unwrap_or_default();
        vec![
            root.join("app.lunaris/server.json"),
            root.join("Lunaris/server.json"),
        ]
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let root = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|home| home.join(".local/share")))
            .unwrap_or_default();
        vec![
            root.join("app.lunaris/server.json"),
            root.join("lunaris/server.json"),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn control_urls_require_https_or_loopback() {
        assert!(control_url("https://api.lunaris.app").is_ok());
        assert!(control_url("http://127.0.0.1:42000").is_ok());
        assert!(control_url("http://api.lunaris.app").is_err());
        assert!(control_url("https://user@example.com").is_err());
    }

    #[test]
    fn validates_server_directory_contract() {
        let valid = serde_json::from_value::<ServerDirectory>(json!({
            "schemaVersion": 1,
            "servers": [
                {
                    "displayName": "United States",
                    "manifestUrl": "https://api-us.lunaris.app/v1/manifest",
                    "serverId": "us",
                    "status": "available"
                },
                {
                    "displayName": "European Union",
                    "serverId": "eu",
                    "status": "planned"
                }
            ]
        }))
        .unwrap();
        assert!(valid.validate().is_ok());

        let duplicate = ServerDirectory {
            schema_version: 1,
            servers: vec![
                DirectoryServer {
                    display_name: "First".into(),
                    manifest_url: Some("https://one.example/v1/manifest".into()),
                    server_id: "same".into(),
                    status: "available".into(),
                },
                DirectoryServer {
                    display_name: "Second".into(),
                    manifest_url: None,
                    server_id: "same".into(),
                    status: "planned".into(),
                },
            ],
        };
        assert!(duplicate.validate().is_err());
    }
}
