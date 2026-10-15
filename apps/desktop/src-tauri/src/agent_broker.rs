use std::collections::{HashMap, VecDeque};
use std::fs::OpenOptions;
use std::io::Write;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use lunaris_agent_mcp::{AgentManifest, AgentTool};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::{oneshot, Mutex, RwLock, Semaphore};

const REQUEST_EVENT: &str = "lunaris://agent-content/request";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const PAIR_TTL_SECS: u64 = 300;
const MAX_PENDING_PAIRS: usize = 32;
const MAX_RESPONSE_BYTES: usize = 2_000_000;
const MAX_FILE_BYTES: usize = 25_000_000;
const RATE_LIMIT_PER_MINUTE: usize = 120;
static AGENT_MANIFEST: LazyLock<AgentManifest> = LazyLock::new(|| {
    AgentManifest::embedded().expect("generated Lunaris agent manifest must be valid")
});

pub struct AgentBroker<R: Runtime>(Arc<AgentBrokerInner<R>>);

impl<R: Runtime> Clone for AgentBroker<R> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

struct AgentBrokerInner<R: Runtime> {
    app: AppHandle<R>,
    config_path: PathBuf,
    descriptor_path: PathBuf,
    downloads: Mutex<HashMap<String, CachedDownload>>,
    inflight: Arc<Semaphore>,
    pending: Mutex<HashMap<String, PendingPair>>,
    rate_limits: Mutex<HashMap<String, VecDeque<Instant>>>,
    requests: Mutex<HashMap<String, PendingRequest>>,
    runtime: RwLock<BrokerRuntime>,
}

#[derive(Default)]
struct BrokerRuntime {
    address: Option<SocketAddr>,
    config: BrokerConfig,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrokerConfig {
    enabled: bool,
    grants: Vec<StoredGrant>,
    session_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredGrant {
    client_id: String,
    client_name: String,
    created_at: u64,
    #[serde(default = "read_scopes")]
    scopes: Vec<String>,
    token_hash: String,
}

#[derive(Clone)]
struct PendingPair {
    client_id: String,
    client_name: String,
    code: String,
    created_at: u64,
    scopes: Vec<String>,
    session_id: Option<String>,
    token: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentRequest {
    id: String,
    method: String,
    path: String,
    query: String,
    body: Option<Value>,
    headers: HashMap<String, String>,
}

struct BrokerResponse {
    body: Value,
    status: u16,
}

struct PendingRequest {
    grant_hash: String,
    sender: oneshot::Sender<BrokerResponse>,
}

struct CachedDownload {
    bytes: Vec<u8>,
    content_type: String,
    expires_at: u64,
    filename: String,
    grant_hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairInput {
    #[serde(default = "default_access")]
    access: String,
    client_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairCreated {
    code: String,
    request_id: String,
    status: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairStatus {
    client_id: Option<String>,
    scopes: Option<Vec<String>>,
    status: &'static str,
    token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAccessStatus {
    address: Option<String>,
    enabled: bool,
    grants: Vec<AgentGrantSummary>,
    pending: Vec<PendingPairSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentGrantSummary {
    client_id: String,
    client_name: String,
    created_at: u64,
    scopes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PendingPairSummary {
    client_name: String,
    code: String,
    request_id: String,
    scopes: Vec<String>,
}

impl<R: Runtime> AgentBroker<R> {
    pub fn new(app: AppHandle<R>) -> Result<Self, String> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let config_path = directory.join("agent-access.json");
        let descriptor_path = directory.join("server.json");
        let config = read_config(&config_path);
        Ok(Self(Arc::new(AgentBrokerInner {
            app,
            config_path,
            descriptor_path,
            downloads: Mutex::new(HashMap::new()),
            inflight: Arc::new(Semaphore::new(16)),
            pending: Mutex::new(HashMap::new()),
            rate_limits: Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            runtime: RwLock::new(BrokerRuntime {
                address: None,
                config,
            }),
        })))
    }

    pub async fn run(self) -> Result<(), String> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|error| error.to_string())?;
        let address = listener.local_addr().map_err(|error| error.to_string())?;
        self.0.runtime.write().await.address = Some(address);
        write_private_json(
            &self.0.descriptor_path,
            &json!({
                "manifestUrl": format!("http://{address}/v1/manifest"),
                "schemaVersion": 1
            }),
        )?;

        let router = Router::new()
            .route("/v1/manifest", get(manifest))
            .route("/v1/agent/pair", post(pair))
            .route("/v1/agent/pair/{request_id}", get(pair_status))
            .route("/v1/agent/files/{token}", get(download))
            .fallback(forward)
            .with_state(self);
        axum::serve(listener, router)
            .await
            .map_err(|error| error.to_string())
    }

    async fn persist(&self) -> Result<(), String> {
        let config = self.0.runtime.read().await.config.clone();
        write_private_json(&self.0.config_path, &config)
    }

    async fn status(&self) -> AgentAccessStatus {
        let mut pending = self.0.pending.lock().await;
        remove_expired_pending(&mut pending);
        let runtime = self.0.runtime.read().await;
        AgentAccessStatus {
            address: runtime.address.map(|value| format!("http://{value}")),
            enabled: runtime.config.enabled,
            grants: runtime
                .config
                .grants
                .iter()
                .map(|grant| AgentGrantSummary {
                    client_id: grant.client_id.clone(),
                    client_name: grant.client_name.clone(),
                    created_at: grant.created_at,
                    scopes: grant.scopes.clone(),
                })
                .collect(),
            pending: pending
                .iter()
                .filter(|(_, value)| value.token.is_none())
                .map(|(request_id, value)| PendingPairSummary {
                    client_name: value.client_name.clone(),
                    code: value.code.clone(),
                    request_id: request_id.clone(),
                    scopes: value.scopes.clone(),
                })
                .collect(),
        }
    }
}

async fn download<R: Runtime>(
    State(broker): State<AgentBroker<R>>,
    Path(token): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = invalid_origin(&headers) {
        return response;
    }
    let mut downloads = broker.0.downloads.lock().await;
    downloads.retain(|_, value| value.expires_at >= now());
    let Some(value) = downloads.remove(&token) else {
        return error(
            StatusCode::NOT_FOUND,
            "DOWNLOAD_EXPIRED",
            "Download URL is invalid or expired",
        );
    };
    let mut response = value.bytes.into_response();
    if let Ok(content_type) = HeaderValue::from_str(&value.content_type) {
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, content_type);
    }
    if let Ok(disposition) = HeaderValue::from_str(&format!(
        "attachment; filename=\"{}\"",
        safe_filename(&value.filename)
    )) {
        response
            .headers_mut()
            .insert(header::CONTENT_DISPOSITION, disposition);
    }
    response
}

async fn manifest<R: Runtime>(
    State(broker): State<AgentBroker<R>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = invalid_origin(&headers) {
        return response;
    }
    let Some(address) = broker.0.runtime.read().await.address else {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DESKTOP_UNAVAILABLE",
            "Desktop server is unavailable",
        );
    };
    Json(json!({
        "apiUrl": format!("http://{address}"),
        "auth": "desktop-pairing",
        "displayName": "Lunaris Desktop",
        "schemaVersion": 1,
        "serverId": "desktop"
    }))
    .into_response()
}

async fn pair<R: Runtime>(
    State(broker): State<AgentBroker<R>>,
    headers: HeaderMap,
    Json(input): Json<PairInput>,
) -> Response {
    if let Some(response) = invalid_origin(&headers) {
        return response;
    }
    let runtime = broker.0.runtime.read().await;
    let enabled = runtime.config.enabled;
    let session_id = runtime.config.session_id.clone();
    drop(runtime);
    if !enabled {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "AGENT_ACCESS_DISABLED",
            "Agent access is disabled",
        );
    }
    let client_name = input.client_name.trim();
    if client_name.is_empty() || client_name.len() > 80 {
        return error(
            StatusCode::BAD_REQUEST,
            "INVALID_CLIENT_NAME",
            "Client name must contain 1-80 characters",
        );
    }
    let Some(scopes) = access_scopes(&input.access) else {
        return error(
            StatusCode::BAD_REQUEST,
            "INVALID_ACCESS",
            "Access must be read, write, or full",
        );
    };
    if !allow_request(&broker, "pairing").await {
        return error(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Pairing request rate limit exceeded",
        );
    }
    let request_id = random_token(18);
    let code = pairing_code();
    let mut pending = broker.0.pending.lock().await;
    remove_expired_pending(&mut pending);
    if pending.len() >= MAX_PENDING_PAIRS {
        return error(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Too many pending pairing requests",
        );
    }
    pending.insert(
        request_id.clone(),
        PendingPair {
            client_id: random_token(12),
            client_name: client_name.to_owned(),
            code: code.clone(),
            created_at: now(),
            scopes,
            session_id,
            token: None,
        },
    );
    drop(pending);
    (
        StatusCode::ACCEPTED,
        Json(PairCreated {
            code,
            request_id,
            status: "pending",
        }),
    )
        .into_response()
}

async fn pair_status<R: Runtime>(
    State(broker): State<AgentBroker<R>>,
    Path(request_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = invalid_origin(&headers) {
        return response;
    }
    let mut pending = broker.0.pending.lock().await;
    remove_expired_pending(&mut pending);
    let Some(request) = pending.get_mut(&request_id) else {
        return error(
            StatusCode::NOT_FOUND,
            "PAIRING_NOT_FOUND",
            "Pairing request not found or expired",
        );
    };
    let Some(token) = request.token.take() else {
        return Json(PairStatus {
            client_id: None,
            scopes: None,
            status: "pending",
            token: None,
        })
        .into_response();
    };
    let client_id = request.client_id.clone();
    let scopes = request.scopes.clone();
    pending.remove(&request_id);
    Json(PairStatus {
        client_id: Some(client_id),
        scopes: Some(scopes),
        status: "approved",
        token: Some(token),
    })
    .into_response()
}

async fn forward<R: Runtime>(
    State(broker): State<AgentBroker<R>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let started = Instant::now();
    if let Some(response) = invalid_origin(&headers) {
        return response;
    }
    let Some(operation) = operation_definition(&method, uri.path()) else {
        return error(
            StatusCode::NOT_FOUND,
            "AGENT_ENDPOINT_NOT_FOUND",
            "Agent endpoint not found",
        );
    };
    let hash = match authorize_request(&broker, operation, &headers).await {
        Ok(hash) => hash,
        Err(response) => return response,
    };
    if uri.to_string().len() > 8_192 || body.len() > 1_000_000 {
        return error(
            StatusCode::URI_TOO_LONG,
            "REQUEST_TOO_LARGE",
            "Content request is too large",
        );
    }

    let Ok(_permit) = broker.0.inflight.clone().try_acquire_owned() else {
        return error(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Too many concurrent content requests",
        );
    };
    let id = random_token(16);
    let (sender, receiver) = oneshot::channel();
    broker.0.requests.lock().await.insert(
        id.clone(),
        PendingRequest {
            grant_hash: hash.clone(),
            sender,
        },
    );
    if !grant_is_active(&broker, &hash).await {
        broker.0.requests.lock().await.remove(&id);
        return error(
            StatusCode::UNAUTHORIZED,
            "REVOKED_CLIENT",
            "Client grant is invalid",
        );
    }
    let request = ContentRequest {
        body: if body.is_empty() {
            None
        } else {
            match serde_json::from_slice(&body) {
                Ok(value) => Some(value),
                Err(_) => {
                    broker.0.requests.lock().await.remove(&id);
                    return error(
                        StatusCode::BAD_REQUEST,
                        "INVALID_REQUEST",
                        "Request body must be valid JSON",
                    );
                }
            }
        },
        headers: forwarded_headers(&headers),
        id: id.clone(),
        method: method.to_string(),
        path: uri.path().to_owned(),
        query: uri.query().unwrap_or_default().to_owned(),
    };
    if broker.0.app.emit(REQUEST_EVENT, request).is_err() {
        broker.0.requests.lock().await.remove(&id);
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DESKTOP_UNAVAILABLE",
            "Desktop content bridge is unavailable",
        );
    }
    match tokio::time::timeout(REQUEST_TIMEOUT, receiver).await {
        Ok(Ok(response)) => {
            let status =
                StatusCode::from_u16(response.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            let body = match materialize_download(&broker, &hash, response.body).await {
                Ok(body) => body,
                Err(response) => return response,
            };
            let size = serde_json::to_vec(&body)
                .map(|value| value.len())
                .unwrap_or(MAX_RESPONSE_BYTES + 1);
            if size > MAX_RESPONSE_BYTES {
                audit_content(
                    &operation.name,
                    started,
                    0,
                    None,
                    Some("RESPONSE_TOO_LARGE"),
                );
                return error(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "RESPONSE_TOO_LARGE",
                    "Content response exceeds the size limit",
                );
            }
            audit_content(
                &operation.name,
                started,
                size,
                body.pointer("/provenance/source").and_then(Value::as_str),
                body.get("code").and_then(Value::as_str),
            );
            (status, Json(body)).into_response()
        }
        _ => {
            broker.0.requests.lock().await.remove(&id);
            audit_content(&operation.name, started, 0, None, Some("DESKTOP_TIMEOUT"));
            error(
                StatusCode::GATEWAY_TIMEOUT,
                "DESKTOP_TIMEOUT",
                "Desktop content request timed out",
            )
        }
    }
}

async fn materialize_download<R: Runtime>(
    broker: &AgentBroker<R>,
    grant_hash: &str,
    body: Value,
) -> Result<Value, Response> {
    let Some(download) = body.get("$download") else {
        return Ok(body);
    };
    let Some(data_b64) = download.get("dataB64").and_then(Value::as_str) else {
        return Err(error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INVALID_DOWNLOAD",
            "Desktop returned invalid cached attachment data",
        ));
    };
    let bytes = STANDARD.decode(data_b64).map_err(|_| {
        error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INVALID_DOWNLOAD",
            "Desktop returned invalid cached attachment data",
        )
    })?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "RESPONSE_TOO_LARGE",
            "Cached attachment exceeds the size limit",
        ));
    }
    let filename = download
        .get("filename")
        .and_then(Value::as_str)
        .unwrap_or("download")
        .to_owned();
    let content_type = download
        .get("contentType")
        .and_then(Value::as_str)
        .unwrap_or("application/octet-stream")
        .to_owned();
    let token = random_token(24);
    broker.0.downloads.lock().await.insert(
        token.clone(),
        CachedDownload {
            bytes,
            content_type,
            expires_at: now() + 60,
            filename,
            grant_hash: grant_hash.to_owned(),
        },
    );
    if !grant_is_active(broker, grant_hash).await {
        broker.0.downloads.lock().await.remove(&token);
        return Err(error(
            StatusCode::UNAUTHORIZED,
            "REVOKED_CLIENT",
            "Client grant is invalid",
        ));
    }
    let Some(address) = broker.0.runtime.read().await.address else {
        return Err(error(
            StatusCode::SERVICE_UNAVAILABLE,
            "DESKTOP_UNAVAILABLE",
            "Desktop server is unavailable",
        ));
    };
    let mut materialized = json!({
        "downloadUrl": format!("http://{address}/v1/agent/files/{token}")
    });
    if let Some(provenance) = body.get("provenance") {
        materialized["provenance"] = provenance.clone();
    }
    Ok(materialized)
}

fn safe_filename(value: &str) -> String {
    value
        .chars()
        .filter(|character| !matches!(character, '"' | '\r' | '\n'))
        .take(200)
        .collect()
}

async fn allow_request<R: Runtime>(broker: &AgentBroker<R>, client: &str) -> bool {
    let mut limits = broker.0.rate_limits.lock().await;
    let requests = limits.entry(client.to_owned()).or_default();
    let cutoff = Instant::now() - Duration::from_secs(60);
    while requests.front().is_some_and(|value| *value < cutoff) {
        requests.pop_front();
    }
    if requests.len() >= RATE_LIMIT_PER_MINUTE {
        return false;
    }
    requests.push_back(Instant::now());
    true
}

async fn authorize_request<R: Runtime>(
    broker: &AgentBroker<R>,
    operation: &AgentTool,
    headers: &HeaderMap,
) -> Result<String, Response> {
    if !broker.0.runtime.read().await.config.enabled {
        return Err(error(
            StatusCode::SERVICE_UNAVAILABLE,
            "AGENT_ACCESS_DISABLED",
            "Agent access is disabled",
        ));
    }
    let token = bearer(headers).ok_or_else(|| {
        error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Bearer token required",
        )
    })?;
    let hash = hash_token(token);
    let grant = broker
        .0
        .runtime
        .read()
        .await
        .config
        .grants
        .iter()
        .find(|grant| grant.token_hash == hash)
        .cloned()
        .ok_or_else(|| {
            error(
                StatusCode::UNAUTHORIZED,
                "REVOKED_CLIENT",
                "Client grant is invalid",
            )
        })?;
    if !operation_scope_allowed(&grant.scopes, operation) {
        return Err(error(
            StatusCode::FORBIDDEN,
            "INSUFFICIENT_SCOPE",
            "Client grant does not allow this operation",
        ));
    }
    if !allow_request(broker, &hash).await {
        return Err(error(
            StatusCode::TOO_MANY_REQUESTS,
            "RATE_LIMITED",
            "Content request rate limit exceeded",
        ));
    }
    Ok(hash)
}

fn operation_definition(method: &Method, path: &str) -> Option<&'static AgentTool> {
    AGENT_MANIFEST.operation_for_request(method.as_str(), path)
}

fn operation_scope_allowed(scopes: &[String], operation: &AgentTool) -> bool {
    scopes.iter().any(|scope| scope == &operation.scope)
}

fn forwarded_headers(headers: &HeaderMap) -> HashMap<String, String> {
    [
        "idempotency-key",
        "if-match",
        "x-lunaris-consistency",
        "x-lunaris-preview",
    ]
    .into_iter()
    .filter_map(|name| {
        headers
            .get(name)
            .and_then(|value| value.to_str().ok())
            .map(|value| (name.to_owned(), value.to_owned()))
    })
    .collect()
}

fn audit_content(
    operation: &str,
    started: Instant,
    result_size: usize,
    source: Option<&str>,
    error_code: Option<&str>,
) {
    eprintln!(
        "{}",
        json!({
            "event": "agent_content",
            "operation": operation,
            "latencyMs": started.elapsed().as_millis(),
            "resultSize": result_size,
            "source": source,
            "errorCode": error_code,
        })
    );
}

#[tauri::command]
pub async fn agent_access_status(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
) -> Result<AgentAccessStatus, String> {
    Ok(broker.status().await)
}

#[tauri::command]
pub async fn agent_access_set_enabled(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
    enabled: bool,
) -> Result<AgentAccessStatus, String> {
    {
        let mut runtime = broker.0.runtime.write().await;
        runtime.config.enabled = enabled;
        if !enabled {
            runtime.config.grants.clear();
        }
    }
    if !enabled {
        broker.0.pending.lock().await.clear();
        broker.0.downloads.lock().await.clear();
        cancel_requests(
            &broker,
            None,
            StatusCode::SERVICE_UNAVAILABLE,
            "AGENT_ACCESS_DISABLED",
            "Agent access is disabled",
        )
        .await;
    }
    broker.persist().await?;
    Ok(broker.status().await)
}

#[tauri::command]
pub async fn agent_access_set_session(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
    session_id: Option<String>,
) -> Result<(), String> {
    let changed = {
        let mut runtime = broker.0.runtime.write().await;
        apply_session(&mut runtime.config, session_id)
    };
    if changed {
        broker.0.pending.lock().await.clear();
        broker.0.downloads.lock().await.clear();
        cancel_requests(
            &broker,
            None,
            StatusCode::UNAUTHORIZED,
            "REVOKED_CLIENT",
            "Client grant is invalid",
        )
        .await;
        broker.persist().await?;
    }
    Ok(())
}

fn apply_session(config: &mut BrokerConfig, session_id: Option<String>) -> bool {
    if config.session_id == session_id {
        return false;
    }
    config.session_id = session_id;
    config.grants.clear();
    true
}

#[tauri::command]
pub async fn agent_access_approve(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
    request_id: String,
) -> Result<AgentAccessStatus, String> {
    let mut pending = broker.0.pending.lock().await;
    remove_expired_pending(&mut pending);
    let request = pending
        .get(&request_id)
        .cloned()
        .ok_or_else(|| "Pairing request not found or expired".to_owned())?;
    let mut runtime = broker.0.runtime.write().await;
    if !runtime.config.enabled || runtime.config.session_id != request.session_id {
        pending.remove(&request_id);
        return Err("Pairing request no longer matches the active session".to_owned());
    }
    if request.token.is_none() {
        let token = random_token(32);
        pending
            .get_mut(&request_id)
            .expect("pairing request exists")
            .token = Some(token.clone());
        runtime.config.grants.push(StoredGrant {
            client_id: request.client_id.clone(),
            client_name: request.client_name.clone(),
            created_at: now(),
            scopes: request.scopes.clone(),
            token_hash: hash_token(&token),
        });
    }
    drop(runtime);
    drop(pending);
    broker.persist().await?;
    Ok(broker.status().await)
}

#[tauri::command]
pub async fn agent_access_revoke(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
    client_id: String,
) -> Result<AgentAccessStatus, String> {
    let revoked_hash = {
        let mut runtime = broker.0.runtime.write().await;
        let hash = runtime
            .config
            .grants
            .iter()
            .find(|grant| grant.client_id == client_id)
            .map(|grant| grant.token_hash.clone());
        runtime
            .config
            .grants
            .retain(|grant| grant.client_id != client_id);
        hash
    };
    if let Some(hash) = revoked_hash {
        broker
            .0
            .downloads
            .lock()
            .await
            .retain(|_, download| download.grant_hash != hash);
        cancel_requests(
            &broker,
            Some(&hash),
            StatusCode::UNAUTHORIZED,
            "REVOKED_CLIENT",
            "Client grant is invalid",
        )
        .await;
    }
    broker.persist().await?;
    Ok(broker.status().await)
}

#[tauri::command]
pub async fn agent_content_respond(
    broker: tauri::State<'_, AgentBroker<tauri::Wry>>,
    request_id: String,
    status: u16,
    body: Value,
) -> Result<(), String> {
    let request = broker.0.requests.lock().await.remove(&request_id);
    if let Some(request) = request {
        let _ = request.sender.send(BrokerResponse { body, status });
    }
    Ok(())
}

async fn grant_is_active<R: Runtime>(broker: &AgentBroker<R>, grant_hash: &str) -> bool {
    let runtime = broker.0.runtime.read().await;
    runtime.config.enabled
        && runtime
            .config
            .grants
            .iter()
            .any(|grant| grant.token_hash == grant_hash)
}

async fn cancel_requests<R: Runtime>(
    broker: &AgentBroker<R>,
    grant_hash: Option<&str>,
    status: StatusCode,
    code: &str,
    message: &str,
) {
    let mut requests = broker.0.requests.lock().await;
    let canceled = take_requests(&mut requests, grant_hash);
    drop(requests);
    for request in canceled {
        let _ = request.sender.send(BrokerResponse {
            body: json!({ "code": code, "message": message }),
            status: status.as_u16(),
        });
    }
}

fn take_requests(
    requests: &mut HashMap<String, PendingRequest>,
    grant_hash: Option<&str>,
) -> Vec<PendingRequest> {
    let ids = requests
        .iter()
        .filter(|(_, request)| grant_hash.is_none_or(|hash| request.grant_hash == hash))
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
    ids.into_iter()
        .filter_map(|id| requests.remove(&id))
        .collect()
}

fn reject_origin(headers: &HeaderMap) -> bool {
    headers.contains_key("origin")
}

fn invalid_origin(headers: &HeaderMap) -> Option<Response> {
    reject_origin(headers).then(|| {
        error(
            StatusCode::FORBIDDEN,
            "INVALID_ORIGIN",
            "Origin is not allowed",
        )
    })
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|value| !value.is_empty())
}

fn error(status: StatusCode, code: &str, message: &str) -> Response {
    (status, Json(json!({ "code": code, "message": message }))).into_response()
}

fn random_token(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    rand::rng().fill_bytes(&mut value);
    URL_SAFE_NO_PAD.encode(value)
}

fn pairing_code() -> String {
    let mut value = [0_u8; 4];
    rand::rng().fill_bytes(&mut value);
    format!("{:06}", u32::from_le_bytes(value) % 1_000_000)
}

fn hash_token(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn remove_expired_pending(pending: &mut HashMap<String, PendingPair>) {
    let cutoff = now().saturating_sub(PAIR_TTL_SECS);
    pending.retain(|_, value| value.created_at >= cutoff);
}

fn default_access() -> String {
    "full".to_owned()
}

fn read_scopes() -> Vec<String> {
    [
        "organization:read",
        "workspace:read",
        "content:read",
        "file:read",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn access_scopes(access: &str) -> Option<Vec<String>> {
    let mut scopes = read_scopes();
    match access {
        "read" => {}
        "write" => scopes.push("workspace:write".to_owned()),
        "full" => {
            scopes.push("workspace:write".to_owned());
            scopes.push("workspace:delete".to_owned());
            scopes.push("organization:manage".to_owned());
        }
        _ => return None,
    }
    Some(scopes)
}

fn read_config(path: &PathBuf) -> BrokerConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default()
}

fn write_private_json(path: &PathBuf, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    file.write_all(&bytes).map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_tokens_are_hashed_before_storage() {
        let token = "private-token";
        let hash = hash_token(token);
        assert_ne!(hash, token);
        assert_eq!(hash, hash_token(token));
    }

    #[test]
    fn browser_origins_are_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert("origin", "https://example.com".parse().unwrap());
        assert!(reject_origin(&headers));
        assert!(!reject_origin(&HeaderMap::new()));
    }

    #[test]
    fn pairing_access_maps_to_exact_scopes() {
        assert_eq!(access_scopes("read").unwrap(), read_scopes());
        assert!(access_scopes("write")
            .unwrap()
            .contains(&"workspace:write".to_owned()));
        assert!(access_scopes("full")
            .unwrap()
            .contains(&"workspace:delete".to_owned()));
        assert!(access_scopes("admin").is_none());
    }

    #[test]
    fn operations_require_write_and_delete_scopes() {
        assert_eq!(
            operation_definition(&Method::POST, "/v1/organizations/ws/workspaces")
                .unwrap()
                .scope,
            "workspace:write"
        );
        assert_eq!(
            operation_definition(
                &Method::POST,
                "/v1/organizations/ws/workspaces/workspace/deletion-preview"
            )
            .unwrap()
            .scope,
            "workspace:delete"
        );
        assert_eq!(
            operation_definition(&Method::GET, "/v1/organizations")
                .unwrap()
                .scope,
            "organization:read"
        );
        assert!(operation_definition(&Method::GET, "/v1/not-agent").is_none());
    }

    #[test]
    fn organization_mutations_require_full_access() {
        assert_eq!(
            operation_definition(&Method::PATCH, "/v1/organizations/ws")
                .unwrap()
                .scope,
            "organization:manage"
        );
        assert_eq!(
            operation_definition(&Method::POST, "/v1/organizations/ws/members/invitations")
                .unwrap()
                .scope,
            "organization:manage"
        );
        assert_eq!(
            operation_definition(
                &Method::POST,
                "/v1/organizations/ws/members/member/removal-preview"
            )
            .unwrap()
            .scope,
            "organization:manage"
        );
        assert_eq!(
            operation_definition(&Method::DELETE, "/v1/organizations/ws/members/member")
                .unwrap()
                .scope,
            "organization:manage"
        );
        assert!(!access_scopes("read")
            .unwrap()
            .contains(&"organization:manage".to_owned()));
        assert!(!access_scopes("write")
            .unwrap()
            .contains(&"organization:manage".to_owned()));
        assert!(access_scopes("full")
            .unwrap()
            .contains(&"organization:manage".to_owned()));
    }

    #[test]
    fn cloud_required_operations_still_require_local_scope() {
        let operation =
            operation_definition(&Method::PATCH, "/v1/organizations/organization").unwrap();
        assert!(!operation_scope_allowed(
            &access_scopes("read").unwrap(),
            operation
        ));
        assert!(operation_scope_allowed(
            &access_scopes("full").unwrap(),
            operation
        ));
    }

    #[test]
    fn forwards_only_agent_control_headers() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer secret".parse().unwrap());
        headers.insert("x-lunaris-consistency", "cached".parse().unwrap());

        let forwarded = forwarded_headers(&headers);

        assert_eq!(
            forwarded.get("x-lunaris-consistency").map(String::as_str),
            Some("cached")
        );
        assert!(!forwarded.contains_key("authorization"));
    }

    #[test]
    fn cancels_only_requests_for_the_revoked_grant() {
        let (revoked_sender, _revoked_receiver) = oneshot::channel();
        let (active_sender, _active_receiver) = oneshot::channel();
        let mut requests = HashMap::from([
            (
                "revoked".to_owned(),
                PendingRequest {
                    grant_hash: "grant-a".to_owned(),
                    sender: revoked_sender,
                },
            ),
            (
                "active".to_owned(),
                PendingRequest {
                    grant_hash: "grant-b".to_owned(),
                    sender: active_sender,
                },
            ),
        ]);

        let canceled = take_requests(&mut requests, Some("grant-a"));

        assert_eq!(canceled.len(), 1);
        assert!(!requests.contains_key("revoked"));
        assert!(requests.contains_key("active"));
    }

    #[test]
    fn session_changes_revoke_existing_grants() {
        let mut config = BrokerConfig {
            enabled: true,
            grants: vec![StoredGrant {
                client_id: "client-1".to_owned(),
                client_name: "ChatGPT Desktop".to_owned(),
                created_at: 1,
                scopes: read_scopes(),
                token_hash: "hash".to_owned(),
            }],
            session_id: Some("session-1".to_owned()),
        };

        assert!(!apply_session(&mut config, Some("session-1".to_owned())));
        assert_eq!(config.grants.len(), 1);
        assert!(apply_session(&mut config, Some("session-2".to_owned())));
        assert!(config.grants.is_empty());
    }
}
