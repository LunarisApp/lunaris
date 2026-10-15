use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde_json::{Map, Number, Value};

use crate::args::{
    Command, FileCommand, KeyValueStorageCommand, OrganizationCommand, PageArgs, ResourceCommand,
    Visibility, WorkspaceCommand, YjsStorageCommand,
};

pub struct OperationCall {
    pub input: Map<String, Value>,
    pub name: String,
}

struct OperationContext<'a> {
    configured_idempotency_key: Option<&'a str>,
    configured_organization: Option<&'a str>,
    global_organization: Option<&'a str>,
}

impl OperationContext<'_> {
    fn organization(&self, value: &Option<String>) -> Result<String, String> {
        value
            .as_deref()
            .or(self.global_organization)
            .or(self.configured_organization)
            .map(str::to_owned)
            .ok_or_else(|| "Organization is required. Pass it or use --organization.".to_owned())
    }

    fn idempotency_key(&self) -> Result<String, String> {
        idempotency_key(self.configured_idempotency_key)
    }
}

pub fn from_command(
    command: &Command,
    global_organization: Option<&str>,
    configured_organization: Option<&str>,
    configured_idempotency_key: Option<&str>,
) -> Result<Option<OperationCall>, String> {
    let context = OperationContext {
        configured_idempotency_key,
        configured_organization,
        global_organization,
    };
    match command {
        Command::Organization { command } => organization_operation(command, &context).map(Some),
        Command::Workspace { command } => workspace_operation(command, &context).map(Some),
        Command::Resource { command } => resource_operation(command, &context).map(Some),
        Command::YjsStorage { command } => yjs_storage_operation(command, &context).map(Some),
        Command::KeyValueStorage { command } => {
            key_value_storage_operation(command, &context).map(Some)
        }
        Command::File { command } => file_operation(command, &context).map(Some),
        Command::Call {
            operation: name,
            input,
        } => raw_operation(name, input).map(Some),
        Command::Auth { .. } | Command::Server { .. } | Command::Mcp { .. } => Ok(None),
    }
}

fn organization_operation(
    command: &OrganizationCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        OrganizationCommand::List(page) => operation("list_organizations", page_input(page)),
        OrganizationCommand::Get { organization_id } => operation(
            "get_organization",
            object([(
                "organizationId",
                Value::String(context.organization(organization_id)?),
            )]),
        ),
        OrganizationCommand::Update {
            organization_id,
            revision,
            name,
            logo,
            clear_logo,
        } => {
            let mut input = object([
                (
                    "organizationId",
                    Value::String(context.organization(organization_id)?),
                ),
                ("expectedRevision", Value::String(revision.clone())),
                ("idempotencyKey", Value::String(context.idempotency_key()?)),
            ]);
            optional_string(&mut input, "name", name);
            nullable_string(&mut input, "logo", logo, *clear_logo);
            operation("update_organization", input)
        }
        OrganizationCommand::Members {
            organization_id,
            page,
        } => {
            let mut input = page_input(page);
            input.insert(
                "organizationId".into(),
                context.organization(organization_id)?.into(),
            );
            operation("list_organization_members", input)
        }
        OrganizationCommand::Invite {
            email,
            organization_id,
            role,
        } => operation(
            "invite_organization_member",
            object([
                (
                    "organizationId",
                    context.organization(organization_id)?.into(),
                ),
                ("email", email.clone().into()),
                ("role", role.clone().into()),
                ("idempotencyKey", context.idempotency_key()?.into()),
            ]),
        ),
        OrganizationCommand::PreviewRemoveMember {
            member_id,
            organization_id,
        } => operation(
            "preview_remove_organization_member",
            object([
                (
                    "organizationId",
                    context.organization(organization_id)?.into(),
                ),
                ("memberId", member_id.clone().into()),
            ]),
        ),
        OrganizationCommand::RemoveMember {
            member_id,
            organization_id,
            preview_token,
        } => operation(
            "remove_organization_member",
            object([
                (
                    "organizationId",
                    context.organization(organization_id)?.into(),
                ),
                ("memberId", member_id.clone().into()),
                ("previewToken", preview_token.clone().into()),
                ("idempotencyKey", context.idempotency_key()?.into()),
            ]),
        ),
    })
}

fn workspace_operation(
    command: &WorkspaceCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        WorkspaceCommand::List {
            organization_id,
            page,
        } => {
            let mut input = page_input(page);
            input.insert(
                "organizationId".into(),
                context.organization(organization_id)?.into(),
            );
            operation("list_workspaces", input)
        }
        WorkspaceCommand::Get {
            workspace_id,
            organization_id,
        } => operation(
            "get_workspace",
            workspace_input(workspace_id, context.organization(organization_id)?),
        ),
        WorkspaceCommand::Create {
            name,
            slug,
            organization_id,
            visibility,
        } => operation(
            "create_workspace",
            object([
                (
                    "organizationId",
                    context.organization(organization_id)?.into(),
                ),
                ("name", name.clone().into()),
                ("slug", slug.clone().into()),
                (
                    "visibility",
                    match visibility {
                        Visibility::Local => "local",
                        Visibility::Shared => "shared",
                    }
                    .into(),
                ),
                ("idempotencyKey", context.idempotency_key()?.into()),
            ]),
        ),
        WorkspaceCommand::Update {
            workspace_id,
            organization_id,
            revision,
            name,
            slug,
        } => {
            let mut input = workspace_input(workspace_id, context.organization(organization_id)?);
            input.insert("expectedRevision".into(), revision.clone().into());
            input.insert("idempotencyKey".into(), context.idempotency_key()?.into());
            optional_string(&mut input, "name", name);
            optional_string(&mut input, "slug", slug);
            operation("update_workspace", input)
        }
        WorkspaceCommand::PreviewDelete {
            workspace_id,
            organization_id,
        } => operation(
            "preview_delete_workspace",
            workspace_input(workspace_id, context.organization(organization_id)?),
        ),
        WorkspaceCommand::Delete {
            workspace_id,
            organization_id,
            preview_token,
        } => {
            let mut input = workspace_input(workspace_id, context.organization(organization_id)?);
            input.insert("previewToken".into(), preview_token.clone().into());
            input.insert("idempotencyKey".into(), context.idempotency_key()?.into());
            operation("delete_workspace", input)
        }
    })
}

fn resource_operation(
    command: &ResourceCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        ResourceCommand::List {
            workspace_id,
            organization_id,
            page,
            name,
            resource_type_id,
            parent_id,
            root,
        } => {
            let mut input = workspace_input(workspace_id, context.organization(organization_id)?);
            extend_page(&mut input, page);
            optional_string(&mut input, "name", name);
            optional_string(&mut input, "resourceTypeId", resource_type_id);
            nullable_string(&mut input, "parentId", parent_id, *root);
            operation("list_resources", input)
        }
        ResourceCommand::Search {
            search,
            organization_id,
            page,
            workspace_id,
        } => {
            let mut input = page_input(page);
            input.insert(
                "organizationId".into(),
                context.organization(organization_id)?.into(),
            );
            input.insert("search".into(), search.clone().into());
            optional_string(&mut input, "workspaceId", workspace_id);
            operation("search_resources", input)
        }
        ResourceCommand::Get {
            workspace_id,
            resource_id,
            organization_id,
        } => operation(
            "get_resource",
            resource_input(
                workspace_id,
                resource_id,
                context.organization(organization_id)?,
            ),
        ),
        ResourceCommand::Create {
            workspace_id,
            name,
            organization_id,
            resource_type_id,
            schema_version,
            parent_id,
            storage,
            icon,
            position,
        } => {
            let mut input = workspace_input(workspace_id, context.organization(organization_id)?);
            input.insert("name".into(), name.clone().into());
            input.insert("idempotencyKey".into(), context.idempotency_key()?.into());
            input.insert("resourceTypeId".into(), resource_type_id.clone().into());
            input.insert("schemaVersion".into(), Number::from(*schema_version).into());
            optional_string(&mut input, "parentId", parent_id);
            let storage = serde_json::from_str::<Value>(storage)
                .map_err(|error| format!("--storage must be valid JSON: {error}"))?;
            if !storage.is_object() {
                return Err("--storage must be a JSON object".into());
            }
            input.insert("storage".into(), storage);
            optional_string(&mut input, "icon", icon);
            optional_i64(&mut input, "position", position);
            operation("create_resource", input)
        }
        ResourceCommand::Update {
            workspace_id,
            resource_id,
            organization_id,
            revision,
            name,
            parent_id,
            root,
            icon,
            clear_icon,
            position,
        } => {
            let mut input = resource_input(
                workspace_id,
                resource_id,
                context.organization(organization_id)?,
            );
            input.insert("expectedRevision".into(), revision.clone().into());
            input.insert("idempotencyKey".into(), context.idempotency_key()?.into());
            optional_string(&mut input, "name", name);
            nullable_string(&mut input, "parentId", parent_id, *root);
            nullable_string(&mut input, "icon", icon, *clear_icon);
            optional_i64(&mut input, "position", position);
            operation("update_resource", input)
        }
        ResourceCommand::PreviewDelete {
            workspace_id,
            resource_id,
            organization_id,
        } => operation(
            "preview_delete_resource",
            resource_input(
                workspace_id,
                resource_id,
                context.organization(organization_id)?,
            ),
        ),
        ResourceCommand::Delete {
            workspace_id,
            resource_id,
            organization_id,
            preview_token,
        } => {
            let mut input = resource_input(
                workspace_id,
                resource_id,
                context.organization(organization_id)?,
            );
            input.insert("previewToken".into(), preview_token.clone().into());
            input.insert("idempotencyKey".into(), context.idempotency_key()?.into());
            operation("delete_resource", input)
        }
    })
}

fn yjs_storage_operation(
    command: &YjsStorageCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        YjsStorageCommand::Json {
            workspace_id,
            storage_id,
            organization_id,
        } => operation(
            "get_yjs_storage_json",
            storage_input(
                workspace_id,
                storage_id,
                context.organization(organization_id)?,
            ),
        ),
        YjsStorageCommand::State {
            workspace_id,
            storage_id,
            organization_id,
            state_vector,
        } => {
            let mut input = storage_input(
                workspace_id,
                storage_id,
                context.organization(organization_id)?,
            );
            optional_string(&mut input, "stateVectorB64", state_vector);
            operation("get_yjs_storage_state", input)
        }
    })
}

fn key_value_storage_operation(
    command: &KeyValueStorageCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        KeyValueStorageCommand::List {
            workspace_id,
            storage_id,
            organization_id,
        } => operation(
            "list_key_value_storage",
            storage_input(
                workspace_id,
                storage_id,
                context.organization(organization_id)?,
            ),
        ),
    })
}

fn file_operation(
    command: &FileCommand,
    context: &OperationContext<'_>,
) -> Result<OperationCall, String> {
    Ok(match command {
        FileCommand::DownloadUrl {
            workspace_id,
            storage_id,
            organization_id,
        } => {
            let mut input = workspace_input(workspace_id, context.organization(organization_id)?);
            input.insert("storageId".into(), storage_id.clone().into());
            operation("get_file_download_url", input)
        }
    })
}

fn raw_operation(name: &str, input: &str) -> Result<OperationCall, String> {
    let value = serde_json::from_str::<Value>(input)
        .map_err(|error| format!("--input must be valid JSON: {error}"))?;
    let Value::Object(input) = value else {
        return Err("--input must be a JSON object".into());
    };
    Ok(OperationCall {
        input,
        name: name.to_owned(),
    })
}

fn operation(name: &'static str, input: Map<String, Value>) -> OperationCall {
    OperationCall {
        input,
        name: name.into(),
    }
}

fn page_input(page: &PageArgs) -> Map<String, Value> {
    let mut input = Map::new();
    extend_page(&mut input, page);
    input
}

fn extend_page(input: &mut Map<String, Value>, page: &PageArgs) {
    input.insert("limit".into(), Value::Number(Number::from(page.limit)));
    optional_string(input, "cursor", &page.cursor);
}

fn workspace_input(workspace_id: &str, organization_id: String) -> Map<String, Value> {
    object([
        ("organizationId", organization_id.into()),
        ("workspaceId", workspace_id.to_owned().into()),
    ])
}

fn resource_input(
    workspace_id: &str,
    resource_id: &str,
    organization_id: String,
) -> Map<String, Value> {
    let mut input = workspace_input(workspace_id, organization_id);
    input.insert("resourceId".into(), resource_id.to_owned().into());
    input
}

fn storage_input(
    workspace_id: &str,
    storage_id: &str,
    organization_id: String,
) -> Map<String, Value> {
    let mut input = workspace_input(workspace_id, organization_id);
    input.insert("storageId".into(), storage_id.to_owned().into());
    input
}

fn optional_string(input: &mut Map<String, Value>, name: &str, value: &Option<String>) {
    if let Some(value) = value {
        input.insert(name.into(), value.clone().into());
    }
}

fn optional_i64(input: &mut Map<String, Value>, name: &str, value: &Option<i64>) {
    if let Some(value) = value {
        input.insert(name.into(), Value::Number(Number::from(*value)));
    }
}

fn nullable_string(
    input: &mut Map<String, Value>,
    name: &str,
    value: &Option<String>,
    clear: bool,
) {
    if clear {
        input.insert(name.into(), Value::Null);
    } else {
        optional_string(input, name, value);
    }
}

fn idempotency_key(configured: Option<&str>) -> Result<String, String> {
    let value = configured.map(str::to_owned).unwrap_or_else(|| {
        let mut bytes = [0_u8; 18];
        rand::rng().fill_bytes(&mut bytes);
        URL_SAFE_NO_PAD.encode(bytes)
    });
    if !(8..=200).contains(&value.len()) {
        return Err("idempotency key must contain 8-200 characters".into());
    }
    Ok(value)
}

fn object<const N: usize>(values: [(&str, Value); N]) -> Map<String, Value> {
    values
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_organization_overrides_global_and_configured_organizations() {
        let command = Command::Workspace {
            command: WorkspaceCommand::Get {
                workspace_id: "workspace".into(),
                organization_id: Some("command-organization".into()),
            },
        };

        let call = from_command(
            &command,
            Some("global-organization"),
            Some("configured-organization"),
            None,
        )
        .unwrap()
        .unwrap();

        assert_eq!(call.input["organizationId"], "command-organization");
    }

    #[test]
    fn raw_operation_requires_an_object() {
        let command = Command::Call {
            operation: "get_workspace".into(),
            input: "[]".into(),
        };

        assert_eq!(
            from_command(&command, None, None, None).err().as_deref(),
            Some("--input must be a JSON object")
        );
    }

    #[test]
    fn update_resource_preserves_null_clear_semantics() {
        let command = Command::Resource {
            command: ResourceCommand::Update {
                workspace_id: "workspace".into(),
                resource_id: "resource".into(),
                organization_id: None,
                revision: "rev".into(),
                name: None,
                parent_id: None,
                root: true,
                icon: None,
                clear_icon: true,
                position: None,
            },
        };
        let call = from_command(&command, Some("organization"), None, Some("request-key"))
            .unwrap()
            .unwrap();
        assert_eq!(call.name, "update_resource");
        assert_eq!(call.input["parentId"], Value::Null);
        assert_eq!(call.input["icon"], Value::Null);
        assert_eq!(call.input["idempotencyKey"], "request-key");
    }
}
