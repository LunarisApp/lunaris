use std::borrow::Cow;
use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::Method;
use rmcp::model::{
    Annotated, CallToolRequestParams, CallToolResult, Content, Implementation,
    ListResourceTemplatesResult, ListToolsResult, Meta, PaginatedRequestParams,
    RawResourceTemplate, ReadResourceRequestParams, ReadResourceResult, ResourceContents,
    ResourceTemplate, ServerCapabilities, ServerInfo, Tool, ToolAnnotations,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData as McpError, RoleServer, ServerHandler};
use serde::Deserialize;
use serde_json::{Map, Value};
use url::Url;

pub const MANIFEST_JSON: &str =
    include_str!("../../../internal/agent-contracts/generated/agent-mcp-manifest.json");

const URI_COMPONENT_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    .add(b'}');

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentOfflineAvailability {
    CloudRequired,
    Supported,
}

impl AgentOfflineAvailability {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CloudRequired => "cloud-required",
            Self::Supported => "supported",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentManifest {
    pub resources: Vec<AgentResource>,
    pub schema_version: u32,
    pub tools: Vec<AgentTool>,
}

impl AgentManifest {
    pub fn embedded() -> Result<Self, AgentError> {
        let manifest = serde_json::from_str::<Self>(MANIFEST_JSON)
            .map_err(|_| AgentError::internal("Generated Lunaris MCP manifest is invalid"))?;
        manifest.validate()?;
        Ok(manifest)
    }

    pub fn tool(&self, name: &str) -> Option<&AgentTool> {
        self.tools.iter().find(|tool| tool.name == name)
    }

    pub fn operation_for_request(&self, method: &str, path: &str) -> Option<&AgentTool> {
        self.tools.iter().find(|tool| {
            tool.wire.method.eq_ignore_ascii_case(method)
                && wire_path_matches(&tool.wire.path, path)
        })
    }

    fn validate(&self) -> Result<(), AgentError> {
        if self.schema_version != 2
            || self.tools.is_empty()
            || self.tools.iter().any(|tool| tool.scope.is_empty())
        {
            return Err(AgentError::internal(
                "Generated Lunaris MCP manifest is unsupported",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResource {
    pub name: String,
    pub operation: String,
    pub uri_template: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTool {
    pub annotations: ToolAnnotations,
    pub description: String,
    pub input_schema: Value,
    pub name: String,
    pub offline_availability: AgentOfflineAvailability,
    pub output_schema: Value,
    #[serde(default)]
    pub plugin_id: Option<String>,
    pub scope: String,
    pub wire: WireDefinition,
}

impl AgentTool {
    fn as_protocol_tool(&self) -> Result<Tool, McpError> {
        let mut meta = Map::from_iter([(
            "app.lunaris/offlineAvailability".into(),
            self.offline_availability.as_str().into(),
        )]);
        if let Some(plugin_id) = &self.plugin_id {
            meta.insert("app.lunaris/pluginId".into(), plugin_id.clone().into());
        }
        Ok(Tool {
            annotations: Some(self.annotations.clone()),
            description: Some(Cow::Owned(self.description.clone())),
            execution: None,
            icons: None,
            input_schema: Arc::new(schema_object(&self.input_schema)?),
            meta: Some(Meta(meta)),
            name: Cow::Owned(self.name.clone()),
            output_schema: Some(Arc::new(schema_object(&self.output_schema)?)),
            title: None,
        })
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WireDefinition {
    #[serde(default)]
    pub body: Vec<String>,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub input_mapping: WireInputMapping,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct WireInputMapping {
    #[serde(default)]
    pub fixed: HashMap<String, Value>,
    #[serde(default)]
    pub renamed: HashMap<String, String>,
}

pub struct AgentHttpRequest {
    pub body: Option<String>,
    pub headers: reqwest::header::HeaderMap,
    pub method: Method,
    pub url: Url,
}

#[derive(Clone, Debug)]
pub struct AgentError {
    pub code: String,
    pub details: Option<Value>,
    pub message: String,
    pub status: u16,
}

impl AgentError {
    pub fn new(status: u16, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            details: None,
            message: message.into(),
            status,
        }
    }

    pub fn from_response(status: reqwest::StatusCode, value: Value) -> Self {
        let code = value
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or("API_ERROR")
            .to_owned();
        let message = value
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Lunaris request failed")
            .to_owned();
        Self {
            code,
            details: value.get("details").cloned(),
            message,
            status: status.as_u16(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(500, "INTERNAL_ERROR", message)
    }

    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(400, "INVALID_REQUEST", message)
    }

    pub fn as_json(&self) -> Value {
        serde_json::json!({
            "code": self.code,
            "message": self.message,
            "status": self.status,
            "details": self.details,
        })
    }
}

impl std::error::Error for AgentError {}

impl std::fmt::Display for AgentError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

#[async_trait]
pub trait AgentExecutor: Clone + Send + Sync + 'static {
    async fn execute(
        &self,
        tool: &AgentTool,
        input: Map<String, Value>,
    ) -> Result<Value, AgentError>;
}

#[derive(Clone)]
pub struct AgentMcpServer<Executor> {
    executor: Executor,
    manifest: Arc<AgentManifest>,
    server: AgentMcpServerInfo,
}

#[derive(Clone, Debug)]
pub struct AgentMcpServerInfo {
    pub description: String,
    pub instructions: String,
    pub name: String,
    pub title: String,
    pub version: String,
}

impl<Executor> AgentMcpServer<Executor> {
    pub fn new(executor: Executor, server: AgentMcpServerInfo) -> Result<Self, AgentError> {
        Ok(Self {
            executor,
            manifest: Arc::new(AgentManifest::embedded()?),
            server,
        })
    }

    pub fn manifest(&self) -> &AgentManifest {
        &self.manifest
    }

    fn tools(&self) -> Result<Vec<Tool>, McpError> {
        self.manifest
            .tools
            .iter()
            .map(AgentTool::as_protocol_tool)
            .collect()
    }

    fn resource_templates(&self) -> Vec<ResourceTemplate> {
        self.manifest
            .resources
            .iter()
            .map(|resource| {
                Annotated::new(
                    RawResourceTemplate {
                        description: Some(resource.name.replace('-', " ")),
                        icons: None,
                        mime_type: Some("application/json".into()),
                        name: resource.name.clone(),
                        title: None,
                        uri_template: resource.uri_template.clone(),
                    },
                    None,
                )
            })
            .collect()
    }
}

impl<Executor: AgentExecutor> ServerHandler for AgentMcpServer<Executor> {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder()
                .enable_resources()
                .enable_tools()
                .build(),
            instructions: Some(self.server.instructions.clone()),
            server_info: Implementation {
                description: Some(self.server.description.clone()),
                icons: None,
                name: self.server.name.clone(),
                title: Some(self.server.title.clone()),
                version: self.server.version.clone(),
                website_url: Some("https://lunaris.app".into()),
            },
            ..Default::default()
        }
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        Ok(ListToolsResult::with_all_items(self.tools()?))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        let Some(tool) = self.manifest.tool(&request.name) else {
            return Err(McpError::invalid_params(
                format!("Unknown Lunaris tool: {}", request.name),
                None,
            ));
        };
        let input = request.arguments.unwrap_or_default();
        Ok(match self.executor.execute(tool, input).await {
            Ok(value) => success_result(value),
            Err(error) => error_result(error),
        })
    }

    async fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListResourceTemplatesResult, McpError> {
        Ok(ListResourceTemplatesResult::with_all_items(
            self.resource_templates(),
        ))
    }

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let Some((resource, input)) = self.manifest.resources.iter().find_map(|resource| {
            match_resource(resource, &request.uri).map(|input| (resource, input))
        }) else {
            return Err(McpError::invalid_params(
                "Unknown Lunaris resource URI",
                None,
            ));
        };
        let Some(tool) = self.manifest.tool(&resource.operation) else {
            return Err(McpError::internal_error(
                "Lunaris resource operation is missing",
                None,
            ));
        };
        let value = self.executor.execute(tool, input).await.map_err(|error| {
            McpError::internal_error(error.message.clone(), Some(error.as_json()))
        })?;
        Ok(ReadResourceResult {
            contents: vec![ResourceContents::TextResourceContents {
                meta: None,
                mime_type: Some("application/json".into()),
                text: value.to_string(),
                uri: request.uri,
            }],
        })
    }
}

pub fn build_request(
    base_url: &Url,
    wire: &WireDefinition,
    input: &Map<String, Value>,
) -> Result<AgentHttpRequest, AgentError> {
    let input = apply_input_mapping(wire, input);
    let mut path = wire.path.clone();
    while let Some(start) = path.find('{') {
        let end = path[start..]
            .find('}')
            .map(|offset| start + offset)
            .ok_or_else(|| AgentError::invalid_request("Generated Lunaris path is invalid"))?;
        let name = &path[start + 1..end];
        let value = input
            .get(name)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AgentError::invalid_request(format!("{name} is required")))?;
        let encoded = utf8_percent_encode(value, URI_COMPONENT_ENCODE_SET).to_string();
        path.replace_range(start..=end, &encoded);
    }
    let mut url = base_url
        .join(&path)
        .map_err(|_| AgentError::invalid_request("Lunaris API URL is invalid"))?;
    {
        let mut query = url.query_pairs_mut();
        for name in &wire.query {
            let Some(value) = input.get(name) else {
                continue;
            };
            if value.is_null() {
                continue;
            }
            let value = value_to_string(value)?;
            if !value.is_empty() {
                query.append_pair(name, &value);
            }
        }
    }
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    for (name, header) in &wire.headers {
        let Some(value) = input.get(name) else {
            continue;
        };
        let mut value = value_to_string(value)?;
        if header.eq_ignore_ascii_case("if-match") && !value.starts_with('"') {
            value = format!("\"{value}\"");
        }
        let header_name = reqwest::header::HeaderName::from_bytes(header.as_bytes())
            .map_err(|_| AgentError::invalid_request("Generated Lunaris header is invalid"))?;
        let header_value = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|_| AgentError::invalid_request(format!("{name} is invalid")))?;
        headers.insert(header_name, header_value);
    }
    let body = if wire.body.is_empty() {
        None
    } else {
        let value = Map::from_iter(
            wire.body
                .iter()
                .filter_map(|name| input.get(name).map(|value| (name.clone(), value.clone()))),
        );
        if value.is_empty() {
            None
        } else {
            headers.insert(
                reqwest::header::CONTENT_TYPE,
                reqwest::header::HeaderValue::from_static("application/json"),
            );
            Some(Value::Object(value).to_string())
        }
    };
    let method = Method::from_bytes(wire.method.as_bytes())
        .map_err(|_| AgentError::invalid_request("Generated Lunaris method is invalid"))?;
    Ok(AgentHttpRequest {
        body,
        headers,
        method,
        url,
    })
}

fn apply_input_mapping(wire: &WireDefinition, input: &Map<String, Value>) -> Map<String, Value> {
    let mut resolved = input.clone();
    for (target, source) in &wire.input_mapping.renamed {
        if let Some(value) = input.get(source) {
            resolved.insert(target.clone(), value.clone());
        }
    }
    for (target, value) in &wire.input_mapping.fixed {
        resolved.insert(target.clone(), value.clone());
    }
    resolved
}

pub fn match_resource(resource: &AgentResource, uri: &str) -> Option<Map<String, Value>> {
    let template = resource.uri_template.split('/').collect::<Vec<_>>();
    let actual = uri.split('/').collect::<Vec<_>>();
    if template.len() != actual.len() {
        return None;
    }
    let mut input = Map::new();
    for (expected, actual) in template.into_iter().zip(actual) {
        if let Some(name) = expected
            .strip_prefix('{')
            .and_then(|value| value.strip_suffix('}'))
        {
            let decoded = percent_decode_str(actual).decode_utf8().ok()?;
            input.insert(name.into(), Value::String(decoded.into_owned()));
        } else if expected != actual {
            return None;
        }
    }
    Some(input)
}

fn wire_path_matches(template: &str, actual: &str) -> bool {
    let template = template
        .trim_end_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    let actual = actual.trim_end_matches('/').split('/').collect::<Vec<_>>();
    template.len() == actual.len()
        && template.iter().zip(actual).all(|(expected, value)| {
            let parameter = expected.starts_with('{') && expected.ends_with('}');
            (parameter && !value.is_empty()) || (!parameter && *expected == value)
        })
}

fn schema_object(schema: &Value) -> Result<Map<String, Value>, McpError> {
    schema
        .as_object()
        .cloned()
        .ok_or_else(|| McpError::internal_error("Generated Lunaris MCP schema is invalid", None))
}

fn value_to_string(value: &Value) -> Result<String, AgentError> {
    match value {
        Value::Bool(value) => Ok(value.to_string()),
        Value::Number(value) => Ok(value.to_string()),
        Value::String(value) => Ok(value.clone()),
        _ => Err(AgentError::invalid_request(
            "Lunaris request value must be scalar",
        )),
    }
}

fn success_result(value: Value) -> CallToolResult {
    CallToolResult {
        content: vec![Content::text(summary(&value))],
        is_error: Some(false),
        meta: None,
        structured_content: Some(value),
    }
}

fn error_result(error: AgentError) -> CallToolResult {
    let value = error.as_json();
    CallToolResult {
        content: vec![Content::text(format!("{}: {}", error.code, error.message))],
        is_error: Some(true),
        meta: None,
        structured_content: Some(value),
    }
}

fn summary(value: &Value) -> String {
    if let Some(items) = value.get("items").and_then(Value::as_array) {
        return format!(
            "{} result{}",
            items.len(),
            if items.len() == 1 { "" } else { "s" }
        );
    }
    let summary = ["name", "id", "storageId"]
        .into_iter()
        .filter_map(|name| value.get(name).and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" · ");
    if summary.is_empty() {
        "OK".into()
    } else {
        summary
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::BTreeSet;

    #[test]
    fn embedded_catalog_has_expected_parity_and_offline_availability() {
        let manifest = AgentManifest::embedded().unwrap();
        let protocol_tools = manifest
            .tools
            .iter()
            .map(AgentTool::as_protocol_tool)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let manifest_names = manifest
            .tools
            .iter()
            .map(|tool| tool.name.as_str())
            .collect::<BTreeSet<_>>();
        let protocol_names = protocol_tools
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<BTreeSet<_>>();
        assert_eq!(manifest.tools.len(), manifest_names.len());
        assert_eq!(manifest_names, protocol_names);
        assert_eq!(
            manifest
                .tool("update_organization")
                .unwrap()
                .offline_availability,
            AgentOfflineAvailability::CloudRequired
        );
        assert_eq!(
            manifest
                .tool("search_resources")
                .unwrap()
                .offline_availability,
            AgentOfflineAvailability::Supported
        );
        assert_eq!(
            manifest
                .tool("kanban_create_task")
                .unwrap()
                .plugin_id
                .as_deref(),
            Some("lunaris.kanban")
        );
        assert_eq!(
            manifest.tool("kanban_update_task").unwrap().scope,
            "workspace:write",
        );
    }

    #[test]
    fn builds_encoded_agent_requests() {
        let manifest = AgentManifest::embedded().unwrap();
        let tool = manifest.tool("update_resource").unwrap();
        let input = Map::from_iter([
            ("organizationId".into(), json!("organization/1")),
            ("workspaceId".into(), json!("workspace 1")),
            ("resourceId".into(), json!("resource-1")),
            ("expectedRevision".into(), json!("revision-1")),
            ("idempotencyKey".into(), json!("request-key")),
            ("name".into(), json!("Updated")),
        ]);
        let request = build_request(
            &Url::parse("http://127.0.0.1:42000").unwrap(),
            &tool.wire,
            &input,
        )
        .unwrap();
        assert_eq!(request.method, Method::PATCH);
        assert!(request.url.path().contains("organization%2F1"));
        assert_eq!(request.headers.get("if-match").unwrap(), "\"revision-1\"");
        assert_eq!(
            serde_json::from_str::<Value>(&request.body.unwrap()).unwrap(),
            json!({ "name": "Updated" })
        );
    }

    #[test]
    fn applies_plugin_routes_and_delegated_mappings() {
        let manifest = AgentManifest::embedded().unwrap();
        let tool = manifest.tool("kanban_create_task").unwrap();
        let input = Map::from_iter([
            ("organizationId".into(), json!("organization-1")),
            ("workspaceId".into(), json!("workspace-1")),
            ("boardId".into(), json!("board-1")),
            ("idempotencyKey".into(), json!("request-key")),
            ("name".into(), json!("Ship it")),
            ("properties".into(), json!({ "Priority": "High" })),
        ]);
        let request = build_request(
            &Url::parse("http://127.0.0.1:42000").unwrap(),
            &tool.wire,
            &input,
        )
        .unwrap();

        assert_eq!(request.method, Method::POST);
        assert_eq!(
            request.url.path(),
            "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/create_task",
        );
        assert_eq!(request.url.query(), Some(""));
        assert_eq!(
            request.headers.get("idempotency-key").unwrap(),
            "request-key",
        );
        assert_eq!(
            serde_json::from_str::<Value>(&request.body.unwrap()).unwrap(),
            json!({
                "boardId": "board-1",
                "name": "Ship it",
                "properties": { "Priority": "High" }
            })
        );

        let update = manifest.tool("kanban_update_task").unwrap();
        let request = build_request(
            &Url::parse("http://127.0.0.1:42000").unwrap(),
            &update.wire,
            &Map::from_iter([
                ("organizationId".into(), json!("organization-1")),
                ("workspaceId".into(), json!("workspace-1")),
                ("boardId".into(), json!("board-1")),
                ("taskId".into(), json!("task-1")),
                ("properties".into(), json!({ "Priority": "High" })),
                ("idempotencyKey".into(), json!("request-key")),
            ]),
        )
        .unwrap();
        assert_eq!(
            request.url.path(),
            "/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/update_task",
        );

        let getter = manifest.tool("kanban_get_board_properties").unwrap();
        let request = build_request(
            &Url::parse("http://127.0.0.1:42000").unwrap(),
            &getter.wire,
            &Map::from_iter([
                ("organizationId".into(), json!("organization-1")),
                ("workspaceId".into(), json!("workspace-1")),
                ("boardId".into(), json!("board-1")),
            ]),
        )
        .unwrap();
        assert_eq!(request.method, Method::GET);
        assert_eq!(
            request.url.as_str(),
            "http://127.0.0.1:42000/v1/organizations/organization-1/workspaces/workspace-1/plugins/lunaris.kanban/operations/get_board_properties?boardId=board-1",
        );

        let preview_delete = manifest.tool("kanban_preview_delete_task").unwrap();
        let request = build_request(
            &Url::parse("http://127.0.0.1:42000").unwrap(),
            &preview_delete.wire,
            &Map::from_iter([
                ("organizationId".into(), json!("organization-1")),
                ("workspaceId".into(), json!("workspace-1")),
                ("taskId".into(), json!("task-1")),
            ]),
        )
        .unwrap();
        assert_eq!(
            request.url.query(),
            Some("expectedResourceTypeId=lunaris.kanban.task"),
        );
    }

    #[test]
    fn matches_resource_templates() {
        let resource = AgentResource {
            name: "yjs-storage-json".into(),
            operation: "get_yjs_storage_json".into(),
            uri_template:
                "lunaris://organizations/{organizationId}/workspaces/{workspaceId}/storage/{storageId}/yjs"
                    .into(),
        };
        let input = match_resource(
            &resource,
            "lunaris://organizations/ws/workspaces/workspace/storage/storage%201/yjs",
        )
        .unwrap();
        assert_eq!(input.get("storageId"), Some(&json!("storage 1")));
    }

    #[test]
    fn resolves_wire_operations_without_scope_heuristics() {
        let manifest = AgentManifest::embedded().unwrap();
        let operation = manifest
            .operation_for_request(
                "DELETE",
                "/v1/organizations/ws/workspaces/workspace/resources/resource",
            )
            .unwrap();
        assert_eq!(operation.name, "delete_resource");
        assert_eq!(operation.scope, "workspace:delete");
        assert!(manifest
            .operation_for_request("POST", "/v1/unknown")
            .is_none());
    }
}
