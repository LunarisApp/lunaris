use std::sync::Arc;

use async_trait::async_trait;
use lunaris_agent_mcp::{build_request, AgentError, AgentExecutor, AgentManifest, AgentTool};
use serde_json::{Map, Value};
use tokio::sync::Mutex;
use url::Url;

use crate::args::{Cli, Consistency};
use crate::config::{self, ConfiguredServer, ServerAuth, StoredCredential};
use crate::discovery::{control_url, discover_desktop, discover_manifest, http_client};
use crate::oauth;

#[derive(Clone)]
pub struct CliExecutor {
    base_url: Url,
    client: reqwest::Client,
    consistency: Option<&'static str>,
    credential: Arc<Mutex<StoredCredential>>,
    server_id: String,
}

pub struct SelectedClient {
    pub executor: CliExecutor,
    pub server: ConfiguredServer,
}

impl CliExecutor {
    pub fn authenticated(
        client: reqwest::Client,
        server_id: String,
        server: &ConfiguredServer,
        credential: StoredCredential,
        consistency: Option<Consistency>,
        allow_stale: bool,
    ) -> Result<Self, String> {
        Ok(Self {
            base_url: control_url(&server.api_url)?,
            client,
            consistency: (server.auth == ServerAuth::DesktopPairing)
                .then(|| {
                    consistency
                        .and_then(Consistency::as_header)
                        .or(allow_stale.then_some("cached"))
                })
                .flatten(),
            credential: Arc::new(Mutex::new(credential)),
            server_id,
        })
    }

    pub async fn operation(
        &self,
        name: &str,
        input: Map<String, Value>,
    ) -> Result<Value, AgentError> {
        let manifest = AgentManifest::embedded()?;
        let tool = manifest
            .tool(name)
            .ok_or_else(|| AgentError::invalid_request(format!("Unknown operation: {name}")))?;
        self.execute(tool, input).await
    }

    async fn current_credential(&self) -> Result<StoredCredential, AgentError> {
        let mut credential = self.credential.lock().await;
        if oauth::needs_refresh(&credential) {
            let refreshed = oauth::refresh(&self.client, &credential, self.base_url.as_str())
                .await
                .map_err(|message| AgentError::new(401, "OAUTH_REFRESH_FAILED", message))?;
            config::write_credential(&self.server_id, &refreshed)
                .map_err(|message| AgentError::new(500, "CREDENTIAL_STORE_ERROR", message))?;
            *credential = refreshed;
        }
        Ok(credential.clone())
    }
}

#[async_trait]
impl AgentExecutor for CliExecutor {
    async fn execute(
        &self,
        tool: &AgentTool,
        input: Map<String, Value>,
    ) -> Result<Value, AgentError> {
        let credential = self.current_credential().await?;
        let request = build_request(&self.base_url, &tool.wire, &input)?;
        let mut builder = self
            .client
            .request(request.method, request.url)
            .headers(request.headers);
        builder = match &credential {
            StoredCredential::ApiKey { api_key } => builder.header("X-Lunaris-API-Key", api_key),
            _ => builder
                .bearer_auth(oauth::access_token(&credential).ok_or_else(|| {
                    AgentError::new(401, "UNAUTHORIZED", "Credential is invalid")
                })?),
        };
        if let Some(consistency) = self.consistency {
            builder = builder.header("X-Lunaris-Consistency", consistency);
        }
        if let Some(body) = request.body {
            builder = builder.body(body);
        }
        let response = builder.send().await.map_err(|_| {
            AgentError::new(
                503,
                "SERVER_UNAVAILABLE",
                "Unable to connect to the selected Lunaris server",
            )
        })?;
        let status = response.status();
        let value = response.json::<Value>().await.unwrap_or_else(|_| {
            serde_json::json!({
                "code": "INVALID_API_RESPONSE",
                "message": "Lunaris returned an invalid response"
            })
        });
        if status.is_success() {
            Ok(value)
        } else {
            Err(AgentError::from_response(status, value))
        }
    }
}

pub async fn selected(cli: &Cli) -> Result<SelectedClient, String> {
    let mut config = config::load()?;
    let client = http_client(cli.timeout)?;
    let (server_id, mut server) = if let Some(base_url) = &cli.base_url {
        let manifest = discover_manifest(&client, base_url).await?;
        (
            manifest.server_id.clone(),
            manifest.configured(cli.organization.clone()),
        )
    } else {
        config::selected(&config, cli.server.as_deref())?
    };
    if server.auth == ServerAuth::DesktopPairing {
        let (manifest, _) = discover_desktop(&client).await?;
        server.api_url = manifest.api_url;
    }
    let credential = config::read_credential(&server_id, server.auth == ServerAuth::OAuth)?
        .ok_or_else(|| {
            format!("Not signed in to {server_id}. Run `lunaris auth login --server {server_id}`.")
        })?;
    match (&server.auth, &credential) {
        (ServerAuth::DesktopPairing, StoredCredential::Desktop { .. }) => {}
        (ServerAuth::DesktopPairing, _) => {
            return Err(
                "Desktop credential is invalid. Run `lunaris auth login --server desktop`.".into(),
            )
        }
        (ServerAuth::OAuth, StoredCredential::Desktop { .. }) => {
            return Err("Desktop credentials cannot be used with a cloud server.".into())
        }
        (ServerAuth::OAuth, StoredCredential::OAuth { resource, .. })
            if normalize(resource) != normalize(&server.api_url) =>
        {
            return Err(
                "OAuth session belongs to another API URL. Run `lunaris auth login` again.".into(),
            )
        }
        _ => {}
    }
    if cli.base_url.is_some() {
        if let Some(existing) = config.servers.get(&server_id) {
            if normalize(&existing.api_url) != normalize(&server.api_url)
                && std::env::var_os("LUNARIS_API_KEY").is_none()
            {
                return Err(
                    "Stored credentials are bound to another API URL. Run `lunaris auth login`."
                        .into(),
                );
            }
        }
    }
    if !config.servers.contains_key(&server_id) && cli.base_url.is_some() {
        config.servers.insert(server_id.clone(), server.clone());
        config::save(&config)?;
    }
    Ok(SelectedClient {
        executor: CliExecutor::authenticated(
            client,
            server_id,
            &server,
            credential,
            cli.consistency,
            cli.allow_stale,
        )?,
        server,
    })
}

fn normalize(value: &str) -> String {
    value.trim_end_matches('/').to_owned()
}
