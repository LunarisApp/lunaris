mod args;
mod client;
mod config;
mod desktop;
mod discovery;
mod login;
mod oauth;
mod operations;
mod output;
mod prompt;

use args::{AuthCommand, Cli, Command, McpCommand, ServerCommand};
use clap::Parser;
use config::{ServerAuth, StoredCredential};
use lunaris_agent_mcp::{AgentError, AgentMcpServer, AgentMcpServerInfo};
use rmcp::transport::stdio;
use rmcp::ServiceExt;
use serde_json::{json, Value};

enum AppError {
    Agent(AgentError),
    Text(String),
}

impl From<String> for AppError {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}

impl From<AgentError> for AppError {
    fn from(value: AgentError) -> Self {
        Self::Agent(value)
    }
}

impl From<login::LoginError> for AppError {
    fn from(value: login::LoginError) -> Self {
        match value {
            login::LoginError::Agent(error) => Self::Agent(error),
            login::LoginError::Text(message) => Self::Text(message),
        }
    }
}

enum Outcome {
    Printed,
    Value(Value),
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let json = cli.json;
    match run(&cli).await {
        Ok(Outcome::Value(value)) => output::print_result(&value, json),
        Ok(Outcome::Printed) => {}
        Err(AppError::Agent(error)) => {
            output::print_agent_error(&error, json);
            std::process::exit(output::exit_code(error.status));
        }
        Err(AppError::Text(message)) => {
            output::print_error(&message, json);
            std::process::exit(1);
        }
    }
}

async fn run(cli: &Cli) -> Result<Outcome, AppError> {
    match &cli.command {
        Command::Auth { command } => auth(cli, command).await,
        Command::Server { command } => server(cli, command).await,
        Command::Mcp {
            command: McpCommand::Serve,
        } => serve_mcp(cli).await,
        command => {
            let selected = client::selected(cli).await?;
            let call = operations::from_command(
                command,
                cli.organization.as_deref(),
                selected.server.organization.as_deref(),
                cli.idempotency_key.as_deref(),
            )?
            .ok_or_else(|| AppError::Text("Command is not an agent operation".into()))?;
            let value = selected.executor.operation(&call.name, call.input).await?;
            Ok(Outcome::Value(value))
        }
    }
}

async fn auth(cli: &Cli, command: &AuthCommand) -> Result<Outcome, AppError> {
    match command {
        AuthCommand::Login {
            access,
            client_name,
            pair_timeout,
            no_default_organization,
            directory_url,
            login_timeout,
            no_open,
        } => {
            if !(30..=1_800).contains(pair_timeout) {
                return Err(AppError::Text(
                    "pair timeout must be 30-1800 seconds".into(),
                ));
            }
            login::validate_prompt_requirements(
                cli.server.as_deref(),
                cli.base_url.as_deref(),
                cli.organization.as_deref(),
                *no_default_organization,
                prompt::can_prompt(),
            )?;
            let http = discovery::http_client(cli.timeout)?;
            let mut config = config::load()?;
            let manifest = login::resolve_manifest(
                &http,
                &config,
                cli.server.as_deref(),
                cli.base_url.as_deref(),
                directory_url,
            )
            .await?;
            let existing_organization = config
                .servers
                .get(&manifest.server_id)
                .and_then(|server| server.organization.clone());
            let credential = match manifest.auth {
                ServerAuth::DesktopPairing => {
                    let default_name = format!("CLI on {}", hostname());
                    desktop::pair(
                        &http,
                        &manifest.api_url,
                        access,
                        client_name.as_deref().unwrap_or(&default_name),
                        *pair_timeout,
                        !cli.json,
                    )
                    .await?
                }
                ServerAuth::OAuth => {
                    oauth::login(&http, &manifest.api_url, *login_timeout, !*no_open).await?
                }
            };
            config::write_credential(&manifest.server_id, &credential)?;
            let organization = if *no_default_organization {
                None
            } else if let Some(organization) = &cli.organization {
                Some(organization.clone())
            } else {
                let configured = manifest.configured(None);
                let executor = client::CliExecutor::authenticated(
                    http.clone(),
                    manifest.server_id.clone(),
                    &configured,
                    credential.clone(),
                    cli.consistency,
                    cli.allow_stale,
                )?;
                login::choose_default_organization(&executor, existing_organization.as_deref())
                    .await?
            };
            config.servers.insert(
                manifest.server_id.clone(),
                manifest.configured(organization.clone()),
            );
            config.current_server = manifest.server_id.clone();
            config::save(&config)?;
            Ok(Outcome::Value(credential_status(
                &manifest.server_id,
                &manifest.api_url,
                &manifest.auth,
                Some(&credential),
                organization.as_deref(),
            )))
        }
        AuthCommand::SetKey => {
            let http = discovery::http_client(cli.timeout)?;
            let mut config = config::load()?;
            let (server_id, server) = if let Some(base_url) = &cli.base_url {
                let manifest = discovery::discover_manifest(&http, base_url).await?;
                (
                    manifest.server_id.clone(),
                    manifest.configured(cli.organization.clone()),
                )
            } else {
                config::selected(&config, cli.server.as_deref())?
            };
            if server.auth != ServerAuth::OAuth {
                return Err(AppError::Text(
                    "Desktop servers use pairing. Run `lunaris auth login`.".into(),
                ));
            }
            let key = match std::env::var("LUNARIS_API_KEY") {
                Ok(value) if !value.is_empty() => value,
                _ => rpassword::prompt_password("API key: ")
                    .map_err(|error| AppError::Text(error.to_string()))?,
            };
            if key.is_empty() {
                return Err(AppError::Text("API key is required".into()));
            }
            config::write_credential(&server_id, &StoredCredential::ApiKey { api_key: key })?;
            config.servers.insert(server_id.clone(), server);
            config.current_server = server_id.clone();
            config::save(&config)?;
            Ok(Outcome::Value(
                json!({ "serverId": server_id, "stored": true }),
            ))
        }
        AuthCommand::SetOrganization { organization_id } => {
            let mut config = config::load()?;
            let (server_id, mut server) = config::selected(&config, cli.server.as_deref())?;
            server.organization = Some(organization_id.clone());
            config.servers.insert(server_id.clone(), server.clone());
            config.current_server = server_id.clone();
            config::save(&config)?;
            Ok(Outcome::Value(json!({
                "apiUrl": server.api_url,
                "serverId": server_id,
                "organization": organization_id,
            })))
        }
        AuthCommand::Status => {
            let config = config::load()?;
            let (server_id, server) = config::selected(&config, cli.server.as_deref())?;
            let credential = config::read_credential(&server_id, server.auth == ServerAuth::OAuth)?;
            Ok(Outcome::Value(credential_status(
                &server_id,
                cli.base_url.as_deref().unwrap_or(&server.api_url),
                &server.auth,
                credential.as_ref(),
                cli.organization
                    .as_deref()
                    .or(server.organization.as_deref()),
            )))
        }
        AuthCommand::Logout => {
            let config = config::load()?;
            let (server_id, _) = config::selected(&config, cli.server.as_deref())?;
            config::delete_credential(&server_id)?;
            Ok(Outcome::Value(
                json!({ "serverId": server_id, "signedIn": false }),
            ))
        }
    }
}

async fn server(cli: &Cli, command: &ServerCommand) -> Result<Outcome, AppError> {
    match command {
        ServerCommand::List { directory_url } => {
            let http = discovery::http_client(cli.timeout)?;
            let config = config::load()?;
            let servers = discovery::discover_servers(&http, directory_url).await?;
            let value = servers
                .into_iter()
                .map(|server| {
                    json!({
                        "active": server.server_id == config.current_server,
                        "displayName": server.display_name,
                        "manifestUrl": server.manifest_url,
                        "serverId": server.server_id,
                        "status": server.status,
                    })
                })
                .collect::<Vec<_>>();
            Ok(Outcome::Value(Value::Array(value)))
        }
        ServerCommand::Use {
            server_id,
            directory_url,
        } => {
            let http = discovery::http_client(cli.timeout)?;
            let manifest = discovery::resolve_server(&http, server_id, directory_url).await?;
            let mut config = config::load()?;
            let organization = config
                .servers
                .get(&manifest.server_id)
                .and_then(|server| server.organization.clone());
            config.servers.insert(
                manifest.server_id.clone(),
                manifest.configured(organization),
            );
            config.current_server = manifest.server_id.clone();
            config::save(&config)?;
            Ok(Outcome::Value(json!({
                "apiUrl": manifest.api_url,
                "auth": manifest.auth,
                "serverId": manifest.server_id,
            })))
        }
    }
}

async fn serve_mcp(cli: &Cli) -> Result<Outcome, AppError> {
    let selected = client::selected(cli).await?;
    let server = AgentMcpServer::new(
        selected.executor,
        AgentMcpServerInfo {
            description: "Native MCP server bundled with Lunaris CLI".into(),
            instructions: "Use Lunaris tools for workspaces and documents. Some Desktop organization administration tools require cloud connectivity. Destructive tools require a preview token from the matching preview tool.".into(),
            name: "lunaris-cli".into(),
            title: "Lunaris CLI".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        },
    )?;
    let service = server
        .serve(stdio())
        .await
        .map_err(|error| AppError::Text(error.to_string()))?;
    service
        .waiting()
        .await
        .map_err(|error| AppError::Text(error.to_string()))?;
    Ok(Outcome::Printed)
}

fn credential_status(
    server_id: &str,
    api_url: &str,
    auth: &ServerAuth,
    credential: Option<&StoredCredential>,
    organization: Option<&str>,
) -> Value {
    let mut value = json!({
        "apiUrl": api_url,
        "auth": auth,
        "serverId": server_id,
        "signedIn": credential.is_some(),
        "organization": organization,
    });
    let Some(credential) = credential else {
        return value;
    };
    let object = value.as_object_mut().expect("status is an object");
    match credential {
        StoredCredential::ApiKey { .. } => {
            object.insert("type".into(), "api-key".into());
        }
        StoredCredential::Desktop {
            client_id, scopes, ..
        } => {
            object.insert("clientId".into(), client_id.clone().into());
            object.insert("scopes".into(), json!(scopes));
            object.insert("type".into(), "desktop-pairing".into());
        }
        StoredCredential::OAuth {
            expires_at, scopes, ..
        } => {
            object.insert("expiresAt".into(), (*expires_at).into());
            object.insert("scopes".into(), json!(scopes));
            object.insert("type".into(), "oauth".into());
        }
    }
    value
}

fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "computer".into())
}
