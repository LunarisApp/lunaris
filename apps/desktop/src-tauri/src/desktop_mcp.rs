use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use async_trait::async_trait;
use keyring::{Entry, Error as KeyringError};
use lunaris_agent_mcp::{
    build_request, AgentError, AgentExecutor, AgentMcpServer, AgentMcpServerInfo, AgentTool,
};
use reqwest::StatusCode;
use rmcp::transport::stdio;
use rmcp::ServiceExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tokio::sync::{Mutex, RwLock};
use url::Url;

const MCP_KEYRING_SERVICE: &str = "app.lunaris.mcp";
const PAIR_POLL_INTERVAL: Duration = Duration::from_millis(750);
const PAIR_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AgentAccess {
    Read,
    Write,
    Full,
}

impl AgentAccess {
    fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Full => "full",
        }
    }

    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "read" => Ok(Self::Read),
            "write" => Ok(Self::Write),
            "full" => Ok(Self::Full),
            _ => Err("Access must be read, write, or full".into()),
        }
    }
}

pub fn parse_invocation(
    args: impl IntoIterator<Item = String>,
) -> Result<Option<AgentAccess>, String> {
    let args = args.into_iter().collect::<Vec<_>>();
    if args.first().map(String::as_str) != Some("mcp") {
        return Ok(None);
    }
    if args.get(1).map(String::as_str) != Some("serve") {
        return Err("Usage: Lunaris mcp serve [--access read|write|full]".into());
    }
    let mut access = AgentAccess::Read;
    let mut index = 2;
    while index < args.len() {
        if args[index] != "--access" {
            return Err(format!("Unknown MCP argument: {}", args[index]));
        }
        let Some(value) = args.get(index + 1) else {
            return Err("--access requires read, write, or full".into());
        };
        access = AgentAccess::parse(value)
            .map_err(|_| "--access requires read, write, or full".to_owned())?;
        index += 2;
    }
    Ok(Some(access))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMcpSetup {
    args: Vec<String>,
    command: String,
    display_command: String,
}

#[tauri::command]
pub fn agent_mcp_setup(access: String) -> Result<AgentMcpSetup, String> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err("Bundled ChatGPT MCP setup supports macOS and Windows".into());
    }
    let access = AgentAccess::parse(&access)?;
    let command = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .to_string_lossy()
        .into_owned();
    let args = vec![
        "mcp".into(),
        "serve".into(),
        "--access".into(),
        access.as_str().into(),
    ];
    let display_command = format!("{} {}", quote_command(&command), args.join(" "));
    Ok(AgentMcpSetup {
        args,
        command,
        display_command,
    })
}

fn quote_command(command: &str) -> String {
    if command.bytes().all(|value| {
        value.is_ascii_alphanumeric() || matches!(value, b'/' | b'\\' | b':' | b'.' | b'_' | b'-')
    }) {
        command.into()
    } else {
        format!("\"{}\"", command.replace('"', "\\\""))
    }
}

pub async fn serve(access: AgentAccess) -> Result<(), Box<dyn std::error::Error>> {
    let connection = DesktopConnection::new(access);
    connection.ensure_pairing_started().await;
    let server = AgentMcpServer::new(
        connection,
        AgentMcpServerInfo {
            description: "Native MCP server bundled with Lunaris Desktop".into(),
            instructions: "Use Lunaris tools for the user's workspaces and documents. Lunaris Desktop must be running. Some organization administration tools require cloud connectivity. Destructive tools require a preview token from the matching preview tool.".into(),
            name: "lunaris-desktop".into(),
            title: "Lunaris Desktop".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        },
    )?;
    let service = server.serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[derive(Clone)]
struct DesktopConnection {
    access: AgentAccess,
    credential: Arc<RwLock<Option<DesktopCredential>>>,
    http: reqwest::Client,
    pairing: Arc<Mutex<bool>>,
}

impl DesktopConnection {
    fn new(access: AgentAccess) -> Self {
        Self {
            access,
            credential: Arc::new(RwLock::new(read_credential(access))),
            http: reqwest::Client::new(),
            pairing: Arc::new(Mutex::new(false)),
        }
    }

    async fn ensure_pairing_started(&self) {
        if self.credential.read().await.is_some() {
            return;
        }
        let mut pairing = self.pairing.lock().await;
        if *pairing {
            return;
        }
        *pairing = true;
        let connection = self.clone();
        tokio::spawn(async move {
            if let Err(error) = connection.pair().await {
                eprintln!("Lunaris MCP pairing pending: {}", error.message);
            }
            *connection.pairing.lock().await = false;
        });
    }

    async fn execute(
        &self,
        tool: &AgentTool,
        input: Map<String, Value>,
    ) -> Result<Value, AgentError> {
        let Some(credential) = self.credential.read().await.clone() else {
            self.ensure_pairing_started().await;
            return Err(AgentError::new(
                401,
                "PAIRING_REQUIRED",
                "Approve “ChatGPT Desktop” in Lunaris Settings → Local Data, then retry.",
            ));
        };
        let descriptor = read_descriptor()?;
        let request = build_request(&descriptor.api_url()?, &tool.wire, &input)?;
        let mut request_builder = self
            .http
            .request(request.method, request.url)
            .headers(request.headers)
            .bearer_auth(&credential.token);
        if let Some(body) = request.body {
            request_builder = request_builder.body(body);
        }
        let response = request_builder.send().await.map_err(|_| unavailable())?;
        let status = response.status();
        let value = response.json::<Value>().await.unwrap_or_else(|_| {
            json!({
                "code": "INVALID_API_RESPONSE",
                "message": "Lunaris Desktop returned an invalid response"
            })
        });
        if status.is_success() {
            return Ok(value);
        }
        if status == StatusCode::UNAUTHORIZED {
            *self.credential.write().await = None;
            delete_credential(self.access);
            self.ensure_pairing_started().await;
        }
        Err(AgentError::from_response(status, value))
    }

    async fn pair(&self) -> Result<(), AgentError> {
        let descriptor = read_descriptor()?;
        self.pair_against(
            descriptor.api_url()?,
            PAIR_POLL_INTERVAL,
            PAIR_TIMEOUT,
            true,
        )
        .await
    }

    async fn pair_against(
        &self,
        api_url: Url,
        poll_interval: Duration,
        timeout: Duration,
        persist: bool,
    ) -> Result<(), AgentError> {
        let response = self
            .http
            .post(api_url.join("/v1/agent/pair").map_err(invalid_url)?)
            .json(&json!({
                "access": self.access.as_str(),
                "clientName": "ChatGPT Desktop"
            }))
            .send()
            .await
            .map_err(|_| unavailable())?;
        let status = response.status();
        let value = response.json::<Value>().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AgentError::from_response(status, value));
        }
        let request_id = value
            .get("requestId")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                AgentError::new(
                    502,
                    "INVALID_API_RESPONSE",
                    "Lunaris Desktop returned an invalid pairing response",
                )
            })?
            .to_owned();
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            tokio::time::sleep(poll_interval).await;
            let response = self
                .http
                .get(
                    api_url
                        .join(&format!("/v1/agent/pair/{request_id}"))
                        .map_err(invalid_url)?,
                )
                .send()
                .await
                .map_err(|_| unavailable())?;
            let status = response.status();
            let value = response.json::<Value>().await.unwrap_or_default();
            if !status.is_success() {
                return Err(AgentError::from_response(status, value));
            }
            if value.get("status").and_then(Value::as_str) != Some("approved") {
                continue;
            }
            let credential: DesktopCredential = serde_json::from_value(value).map_err(|_| {
                AgentError::new(
                    502,
                    "INVALID_API_RESPONSE",
                    "Lunaris Desktop returned an invalid pairing credential",
                )
            })?;
            if persist {
                write_credential(self.access, &credential)?;
            }
            *self.credential.write().await = Some(credential);
            return Ok(());
        }
        Err(AgentError::new(
            408,
            "PAIRING_TIMEOUT",
            "Lunaris Desktop pairing timed out; retry a tool call to request pairing again.",
        ))
    }
}

#[async_trait]
impl AgentExecutor for DesktopConnection {
    async fn execute(
        &self,
        tool: &AgentTool,
        input: Map<String, Value>,
    ) -> Result<Value, AgentError> {
        DesktopConnection::execute(self, tool, input).await
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCredential {
    client_id: String,
    scopes: Vec<String>,
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDescriptor {
    manifest_url: String,
    schema_version: u32,
}

impl DesktopDescriptor {
    fn api_url(&self) -> Result<Url, AgentError> {
        let url = Url::parse(&self.manifest_url).map_err(invalid_url)?;
        if self.schema_version != 1 || !is_loopback_http(&url) {
            return Err(unavailable());
        }
        let mut api = url;
        api.set_path("");
        api.set_query(None);
        api.set_fragment(None);
        Ok(api)
    }
}

fn read_descriptor() -> Result<DesktopDescriptor, AgentError> {
    for path in descriptor_paths() {
        let Ok(value) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(descriptor) = serde_json::from_str::<DesktopDescriptor>(&value) else {
            continue;
        };
        if descriptor.api_url().is_ok() {
            return Ok(descriptor);
        }
    }
    Err(unavailable())
}

fn descriptor_paths() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let Some(home) = std::env::var_os("HOME") else {
            return vec![];
        };
        let root = PathBuf::from(home).join("Library/Application Support");
        vec![
            root.join("app.lunaris/server.json"),
            root.join("Lunaris/server.json"),
        ]
    }
    #[cfg(target_os = "windows")]
    {
        let root = std::env::var_os("APPDATA").map(PathBuf::from).or_else(|| {
            std::env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join("AppData/Roaming"))
        });
        root.map(|root| {
            vec![
                root.join("app.lunaris/server.json"),
                root.join("Lunaris/server.json"),
            ]
        })
        .unwrap_or_default()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let root = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
            });
        root.map(|root| {
            vec![
                root.join("app.lunaris/server.json"),
                root.join("lunaris/server.json"),
            ]
        })
        .unwrap_or_default()
    }
}

fn is_loopback_http(url: &Url) -> bool {
    url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
        && url.username().is_empty()
        && url.password().is_none()
}

fn unavailable() -> AgentError {
    AgentError::new(
        503,
        "DESKTOP_UNAVAILABLE",
        "Start Lunaris Desktop and enable Agent access in Settings → Local Data.",
    )
}

fn invalid_url(_error: url::ParseError) -> AgentError {
    unavailable()
}

fn credential_account(access: AgentAccess) -> String {
    format!("desktop-{}", access.as_str())
}

fn credential_entry(access: AgentAccess) -> Result<Entry, AgentError> {
    Entry::new(MCP_KEYRING_SERVICE, &credential_account(access)).map_err(|_| {
        AgentError::new(
            500,
            "CREDENTIAL_STORE_ERROR",
            "Unable to access the MCP credential store",
        )
    })
}

fn read_credential(access: AgentAccess) -> Option<DesktopCredential> {
    let value = credential_entry(access).ok()?.get_password().ok()?;
    serde_json::from_str(&value).ok()
}

fn write_credential(access: AgentAccess, credential: &DesktopCredential) -> Result<(), AgentError> {
    credential_entry(access)?
        .set_password(&serde_json::to_string(credential).map_err(|_| {
            AgentError::new(
                500,
                "CREDENTIAL_STORE_ERROR",
                "Unable to encode the MCP credential",
            )
        })?)
        .map_err(|_| {
            AgentError::new(
                500,
                "CREDENTIAL_STORE_ERROR",
                "Unable to save the MCP credential",
            )
        })
}

fn delete_credential(access: AgentAccess) {
    match credential_entry(access).and_then(|entry| {
        entry.delete_credential().map_err(|error| match error {
            KeyringError::NoEntry => AgentError::new(404, "NO_ENTRY", "No credential"),
            _ => AgentError::new(
                500,
                "CREDENTIAL_STORE_ERROR",
                "Unable to delete the MCP credential",
            ),
        })
    }) {
        Ok(()) | Err(AgentError { status: 404, .. }) => {}
        Err(_) => eprintln!("Lunaris MCP could not clear its revoked credential"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::extract::State;
    use axum::routing::{get, post};
    use axum::{Json, Router};

    #[test]
    fn parses_headless_mcp_invocation() {
        assert_eq!(
            parse_invocation(["mcp", "serve"].map(str::to_owned)).unwrap(),
            Some(AgentAccess::Read)
        );
        assert_eq!(
            parse_invocation(["mcp", "serve", "--access", "full"].map(str::to_owned)).unwrap(),
            Some(AgentAccess::Full)
        );
        assert_eq!(
            parse_invocation(["--version"].map(str::to_owned)).unwrap(),
            None
        );
        assert!(
            parse_invocation(["mcp", "serve", "--access", "admin"].map(str::to_owned)).is_err()
        );
    }

    #[test]
    fn renders_setup_commands_with_safe_path_quoting() {
        assert_eq!(
            quote_command("/Applications/Lunaris.app/Lunaris"),
            "/Applications/Lunaris.app/Lunaris"
        );
        assert_eq!(
            quote_command("C:\\Program Files\\Lunaris\\Lunaris.exe"),
            "\"C:\\Program Files\\Lunaris\\Lunaris.exe\""
        );
    }

    #[tokio::test]
    async fn pairs_without_blocking_protocol_startup_and_reuses_credential() {
        let polls = Arc::new(AtomicUsize::new(0));
        let app = Router::new()
            .route(
                "/v1/agent/pair",
                post(|| async {
                    (
                        StatusCode::ACCEPTED,
                        Json(json!({
                            "code": "123 456",
                            "requestId": "request-1",
                            "status": "pending"
                        })),
                    )
                }),
            )
            .route(
                "/v1/agent/pair/{request_id}",
                get(|State(polls): State<Arc<AtomicUsize>>| async move {
                    if polls.fetch_add(1, Ordering::SeqCst) == 0 {
                        Json(json!({ "status": "pending" }))
                    } else {
                        Json(json!({
                            "clientId": "client-1",
                            "scopes": ["organization:read"],
                            "status": "approved",
                            "token": "secret-token"
                        }))
                    }
                }),
            )
            .with_state(Arc::clone(&polls));
        let (api_url, server) = start_mock_broker(app).await;
        let connection = test_connection(AgentAccess::Read);

        connection
            .pair_against(
                api_url,
                Duration::from_millis(1),
                Duration::from_secs(1),
                false,
            )
            .await
            .unwrap();

        let credential = connection.credential.read().await.clone().unwrap();
        assert_eq!(credential.client_id, "client-1");
        assert_eq!(credential.scopes, vec!["organization:read"]);
        assert_eq!(credential.token, "secret-token");
        server.abort();
    }

    #[tokio::test]
    async fn reports_disabled_and_timed_out_pairing() {
        let disabled = Router::new().route(
            "/v1/agent/pair",
            post(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "code": "AGENT_ACCESS_DISABLED",
                        "message": "Agent access is disabled"
                    })),
                )
            }),
        );
        let (api_url, server) = start_mock_broker(disabled).await;
        let error = test_connection(AgentAccess::Read)
            .pair_against(
                api_url,
                Duration::from_millis(1),
                Duration::from_millis(10),
                false,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, "AGENT_ACCESS_DISABLED");
        server.abort();

        let pending = Router::new()
            .route(
                "/v1/agent/pair",
                post(|| async {
                    (
                        StatusCode::ACCEPTED,
                        Json(json!({
                            "code": "123 456",
                            "requestId": "request-1",
                            "status": "pending"
                        })),
                    )
                }),
            )
            .route(
                "/v1/agent/pair/{request_id}",
                get(|| async { Json(json!({ "status": "pending" })) }),
            );
        let (api_url, server) = start_mock_broker(pending).await;
        let error = test_connection(AgentAccess::Read)
            .pair_against(
                api_url,
                Duration::from_millis(1),
                Duration::from_millis(5),
                false,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code, "PAIRING_TIMEOUT");
        server.abort();
    }

    #[test]
    fn accepts_only_current_loopback_descriptors() {
        assert!(DesktopDescriptor {
            manifest_url: "http://127.0.0.1:42000/v1/manifest".into(),
            schema_version: 1,
        }
        .api_url()
        .is_ok());
        assert!(DesktopDescriptor {
            manifest_url: "https://example.com/v1/manifest".into(),
            schema_version: 1,
        }
        .api_url()
        .is_err());
        assert!(DesktopDescriptor {
            manifest_url: "http://localhost:42000/v1/manifest".into(),
            schema_version: 2,
        }
        .api_url()
        .is_err());
    }

    fn test_connection(access: AgentAccess) -> DesktopConnection {
        DesktopConnection {
            access,
            credential: Arc::new(RwLock::new(None)),
            http: reqwest::Client::new(),
            pairing: Arc::new(Mutex::new(false)),
        }
    }

    async fn start_mock_broker(app: Router) -> (Url, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (Url::parse(&format!("http://{address}")).unwrap(), server)
    }
}
