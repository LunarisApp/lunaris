use std::collections::HashSet;

use lunaris_agent_mcp::AgentError;
use serde::Deserialize;
use serde_json::{Map, Value};

use crate::client::CliExecutor;
use crate::config::Config;
use crate::discovery::{
    discover_manifest, discover_servers, resolve_directory_server, resolve_server, ServerManifest,
};
use crate::prompt::{self, Choice};

const CUSTOM_SERVER: &str = "custom";

pub enum LoginError {
    Agent(AgentError),
    Text(String),
}

impl From<AgentError> for LoginError {
    fn from(value: AgentError) -> Self {
        Self::Agent(value)
    }
}

impl From<String> for LoginError {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

pub fn validate_prompt_requirements(
    server_id: Option<&str>,
    base_url: Option<&str>,
    organization: Option<&str>,
    no_default_organization: bool,
    can_prompt: bool,
) -> Result<(), String> {
    if organization.is_some() && no_default_organization {
        return Err("Cannot combine --organization with --no-default-organization".into());
    }
    let needs_server_prompt = server_id.is_none() && base_url.is_none();
    let needs_organization_prompt = organization.is_none() && !no_default_organization;
    if (needs_server_prompt || needs_organization_prompt) && !can_prompt {
        return Err(
            "Interactive login requires a TTY. Pass --server or --base-url and either --organization or --no-default-organization.".into(),
        );
    }
    Ok(())
}

pub async fn resolve_manifest(
    client: &reqwest::Client,
    config: &Config,
    server_id: Option<&str>,
    base_url: Option<&str>,
    directory_url: &str,
) -> Result<ServerManifest, String> {
    if let Some(base_url) = base_url {
        return discover_manifest(client, base_url).await;
    }
    if let Some(server_id) = server_id {
        if server_id != "desktop" {
            if let Some(server) = config.servers.get(server_id) {
                return discover_manifest(client, &server.api_url).await;
            }
        }
        return resolve_server(client, server_id, directory_url).await;
    }

    let servers = discover_servers(client, directory_url)
        .await?
        .into_iter()
        .filter(|server| server.status == "available")
        .collect::<Vec<_>>();
    let mut choices = servers
        .iter()
        .enumerate()
        .map(|(index, server)| Choice {
            label: format!("{} ({})", server.display_name, server.server_id),
            value: format!("server:{index}"),
        })
        .collect::<Vec<_>>();
    choices.push(Choice {
        label: "Custom server URL…".into(),
        value: CUSTOM_SERVER.into(),
    });
    let current = servers
        .iter()
        .position(|server| server.server_id == config.current_server)
        .map(|index| format!("server:{index}"));
    let selected = prompt::select(
        "Choose a Lunaris server:",
        &choices,
        current.as_deref().or(Some(CUSTOM_SERVER)),
    )?;
    if selected == CUSTOM_SERVER {
        let base_url = prompt::text("Enter custom server URL:")?;
        if base_url.is_empty() {
            return Err("Custom server URL is required".into());
        }
        return discover_manifest(client, &base_url).await;
    }
    let index = selected
        .strip_prefix("server:")
        .and_then(|value| value.parse::<usize>().ok())
        .ok_or_else(|| "Selected server is unavailable".to_owned())?;
    let server = servers
        .get(index)
        .ok_or_else(|| "Selected server is unavailable".to_owned())?;
    resolve_directory_server(client, server).await
}

pub async fn choose_default_organization(
    executor: &CliExecutor,
    current_organization: Option<&str>,
) -> Result<Option<String>, LoginError> {
    let mut organizations = Vec::new();
    let mut cursor: Option<String> = None;
    let mut seen_cursors = HashSet::new();
    loop {
        let mut input = Map::from_iter([("limit".into(), Value::from(100))]);
        if let Some(cursor) = cursor.as_ref() {
            input.insert("cursor".into(), Value::String(cursor.clone()));
        }
        let value = executor.operation("list_organizations", input).await?;
        let page = serde_json::from_value::<OrganizationPage>(value).map_err(|_| {
            AgentError::new(
                502,
                "INVALID_API_RESPONSE",
                "Organization listing returned an invalid response",
            )
        })?;
        organizations.extend(page.items);
        let Some(next_cursor) = page.next_cursor.filter(|cursor| !cursor.is_empty()) else {
            break;
        };
        if !seen_cursors.insert(next_cursor.clone()) {
            return Err(AgentError::new(
                502,
                "INVALID_API_RESPONSE",
                "Organization pagination returned a repeated cursor",
            )
            .into());
        }
        cursor = Some(next_cursor);
    }

    if organizations.is_empty() {
        return Ok(None);
    }
    let mut choices = vec![Choice {
        label: "None (require --organization for organization-scoped commands)".into(),
        value: String::new(),
    }];
    choices.extend(organizations.iter().map(|organization| Choice {
        label: format!("{} ({})", organization.name, organization.slug),
        value: organization.id.clone(),
    }));
    let default = current_organization.filter(|current| {
        organizations
            .iter()
            .any(|organization| organization.id == *current)
    });
    let selected = prompt::select(
        "Choose a default organization:",
        &choices,
        Some(default.unwrap_or_default()),
    )?;
    Ok((!selected.is_empty()).then_some(selected))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrganizationPage {
    items: Vec<Organization>,
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
struct Organization {
    id: String,
    name: String,
    slug: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_login_is_valid_without_tty() {
        assert!(
            validate_prompt_requirements(Some("us"), None, Some("organization"), false, false,)
                .is_ok()
        );
        assert!(validate_prompt_requirements(Some("us"), None, None, true, false).is_ok());
    }

    #[test]
    fn missing_values_require_tty() {
        assert!(validate_prompt_requirements(None, None, None, false, false).is_err());
        assert!(validate_prompt_requirements(Some("us"), None, None, false, false).is_err());
        assert!(validate_prompt_requirements(None, None, None, false, true).is_ok());
    }

    #[test]
    fn organization_flags_are_mutually_exclusive() {
        assert!(
            validate_prompt_requirements(Some("us"), None, Some("organization"), true, true,)
                .is_err()
        );
    }
}
