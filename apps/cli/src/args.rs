use clap::{Args, Parser, Subcommand, ValueEnum};

use crate::discovery::DEFAULT_SERVER_DIRECTORY_URL;

#[derive(Debug, Parser)]
#[command(
    name = "lunaris",
    version,
    long_version = env!("LUNARIS_BUILD_VERSION"),
    about = "Manage Lunaris workspaces and resources",
    after_help = "Examples:\n  lunaris auth login\n  lunaris workspace list\n  lunaris resource search roadmap\n  lunaris --json workspace list\n\nUse lunaris <command> --help to explore a command group."
)]
pub struct Cli {
    /// Server ID to use instead of the saved active server.
    #[arg(long, global = true, help_heading = "Global options")]
    pub server: Option<String>,
    /// Organization ID to use instead of the saved default.
    #[arg(long, global = true, help_heading = "Global options")]
    pub organization: Option<String>,
    /// Override the API base URL for this invocation.
    #[arg(long, global = true, help_heading = "Global options")]
    pub base_url: Option<String>,
    /// Allow cached desktop reads; equivalent to --consistency cached.
    #[arg(
        long,
        global = true,
        help_heading = "Global options",
        conflicts_with = "consistency"
    )]
    pub allow_stale: bool,
    /// Choose how desktop reads check freshness.
    #[arg(long, global = true, help_heading = "Global options", value_enum)]
    pub consistency: Option<Consistency>,
    /// Reuse a mutation request key for retries (8-200 characters; generated if omitted).
    #[arg(long, global = true, help_heading = "Global options")]
    pub idempotency_key: Option<String>,
    /// Print JSON envelopes; successful piped output also uses JSON.
    #[arg(long, global = true, help_heading = "Global options")]
    pub json: bool,
    /// HTTP request timeout in milliseconds.
    #[arg(
        long,
        global = true,
        help_heading = "Global options",
        default_value_t = 30_000
    )]
    pub timeout: u64,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Sign in and manage saved credentials and organization defaults.
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    /// Discover servers and choose the active connection.
    Server {
        #[command(subcommand)]
        command: ServerCommand,
    },
    /// Inspect organizations and manage their members.
    Organization {
        #[command(subcommand)]
        command: OrganizationCommand,
    },
    /// List, create, update, and delete workspaces.
    Workspace {
        #[command(subcommand)]
        command: WorkspaceCommand,
    },
    /// Find and manage workspace resources.
    Resource {
        #[command(subcommand)]
        command: ResourceCommand,
    },
    /// Read resource storage by format.
    Storage {
        #[command(subcommand)]
        command: StorageCommand,
    },
    /// Deprecated: use storage yjs.
    #[command(hide = true)]
    YjsStorage {
        #[command(subcommand)]
        command: YjsStorageCommand,
    },
    /// Deprecated: use storage kv.
    #[command(hide = true)]
    KeyValueStorage {
        #[command(subcommand)]
        command: KeyValueStorageCommand,
    },
    /// Deprecated: use storage file.
    #[command(hide = true)]
    File {
        #[command(subcommand)]
        command: FileCommand,
    },
    /// Run the Model Context Protocol server for AI clients.
    Mcp {
        #[command(subcommand)]
        command: McpCommand,
    },
    /// Invoke any generated agent operation with a JSON object.
    Call {
        /// Operation name from the generated agent contract, e.g. search_resources.
        #[arg(required_unless_present = "list", conflicts_with = "list")]
        operation: Option<String>,
        /// List available operations without connecting to a server.
        #[arg(long, conflicts_with_all = ["operation", "input"])]
        list: bool,
        /// Complete operation input as a JSON object; include organizationId when required.
        #[arg(long, required_unless_present = "list", requires = "operation")]
        input: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum StorageCommand {
    /// Read Yjs storage as JSON or encoded state.
    Yjs {
        #[command(subcommand)]
        command: YjsStorageCommand,
    },
    /// Read key-value storage entries.
    Kv {
        #[command(subcommand)]
        command: KeyValueStorageCommand,
    },
    /// Get download URLs for file storage.
    File {
        #[command(subcommand)]
        command: FileCommand,
    },
}

#[derive(Clone, Debug, ValueEnum)]
pub enum Access {
    /// Read resources and metadata.
    Read,
    /// Read and write resources.
    Write,
    /// Request full Desktop agent access.
    Full,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Consistency {
    /// Let Desktop choose freshness based on the operation.
    Adaptive,
    /// Read the local cache, which may be incomplete or stale.
    Cached,
    /// Require a confirmed read from Desktop.
    Confirmed,
}

impl Consistency {
    pub fn as_header(self) -> Option<&'static str> {
        match self {
            Self::Adaptive => None,
            Self::Cached => Some("cached"),
            Self::Confirmed => Some("confirmed"),
        }
    }
}

impl Access {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Full => "full",
        }
    }
}

#[derive(Debug, Subcommand)]
pub enum AuthCommand {
    /// Sign in through a browser or pair with Lunaris Desktop.
    Login {
        /// Requested access level when pairing with Desktop.
        #[arg(long, value_enum, default_value = "full")]
        access: Access,
        /// Name shown when authorizing this CLI client.
        #[arg(long)]
        client_name: Option<String>,
        /// Seconds to wait for Desktop pairing (30-1800).
        #[arg(long, default_value_t = 120)]
        pair_timeout: u64,
        /// Skip choosing and saving a default organization at login.
        #[arg(long)]
        no_default_organization: bool,
        /// URL of the server discovery directory.
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
        /// Seconds to wait for browser sign-in.
        #[arg(long, default_value_t = 300)]
        login_timeout: u64,
        /// Print the sign-in URL without opening a browser.
        #[arg(long)]
        no_open: bool,
    },
    /// Save LUNARIS_API_KEY, or prompt securely for a server API key.
    SetKey,
    /// Save the default organization for the selected server.
    SetOrganization {
        /// Organization ID to save as the default.
        organization_id: String,
    },
    /// Show the selected server, sign-in status, and default organization.
    Status,
    /// Remove saved credentials for the selected server.
    Logout,
}

#[derive(Debug, Subcommand)]
pub enum ServerCommand {
    /// List available servers and mark the active server.
    List {
        /// URL of the server discovery directory.
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
    },
    /// Select and save the active server.
    Use {
        /// Server ID from server list.
        server_id: String,
        /// URL of the server discovery directory.
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
    },
}

#[derive(Clone, Debug, Args)]
pub struct PageArgs {
    /// Maximum number of results per page.
    #[arg(long, default_value_t = 50)]
    pub limit: u16,
    /// Opaque nextCursor from the previous page.
    #[arg(long)]
    pub cursor: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum OrganizationCommand {
    /// List accessible organizations.
    List(PageArgs),
    /// Show organization details, including its current revision.
    Get {
        /// Organization ID; defaults to --organization, then the saved default.
        organization_id: Option<String>,
    },
    /// Update organization details using the current revision.
    Update {
        /// Organization ID; defaults to --organization, then the saved default.
        organization_id: Option<String>,
        /// Current revision from get; rejects changes if the entity has changed.
        #[arg(long)]
        revision: String,
        /// Display name.
        #[arg(long)]
        name: Option<String>,
        /// Organization logo value.
        #[arg(long, conflicts_with = "clear_logo")]
        logo: Option<String>,
        /// Remove the organization logo.
        #[arg(long)]
        clear_logo: bool,
    },
    /// List organization members and their roles.
    Members {
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
    },
    /// Invite a person by email with the specified role.
    Invite {
        /// Email address of the person to invite.
        email: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Organization role to grant.
        #[arg(long, value_parser = ["admin", "member"])]
        role: String,
    },
    /// Preview member removal and obtain a confirmation token.
    #[command(hide = true)]
    PreviewRemoveMember {
        /// Member ID from organization members.
        member_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Preview or apply member removal.
    RemoveMember {
        /// Member ID from organization members.
        member_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Preview the action and obtain a token without applying changes.
        #[arg(
            long,
            required_unless_present = "preview_token",
            conflicts_with = "preview_token"
        )]
        preview: bool,
        /// Token from --preview; review the preview before applying the action.
        #[arg(long, required_unless_present = "preview", conflicts_with = "preview")]
        preview_token: Option<String>,
    },
}

#[derive(Clone, Debug, ValueEnum)]
pub enum Visibility {
    Local,
    Shared,
}

#[derive(Debug, Subcommand)]
pub enum WorkspaceCommand {
    /// List workspaces in an organization.
    List {
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
    },
    /// Show workspace details, including its current revision.
    Get {
        /// Workspace ID from workspace list.
        workspace_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Create a workspace with a name and slug.
    Create {
        /// Display name.
        name: String,
        /// Workspace URL slug.
        slug: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Workspace visibility.
        #[arg(long, value_enum, default_value = "shared")]
        visibility: Visibility,
    },
    /// Update a workspace using the current revision.
    Update {
        /// Workspace ID from workspace list.
        workspace_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Current revision from get; rejects changes if the entity has changed.
        #[arg(long)]
        revision: String,
        /// Display name.
        #[arg(long)]
        name: Option<String>,
        /// Workspace URL slug.
        #[arg(long)]
        slug: Option<String>,
    },
    /// Preview workspace deletion and obtain a confirmation token.
    #[command(hide = true)]
    PreviewDelete {
        /// Workspace ID from workspace list.
        workspace_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Preview or apply workspace deletion.
    Delete {
        /// Workspace ID from workspace list.
        workspace_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Preview the action and obtain a token without applying changes.
        #[arg(
            long,
            required_unless_present = "preview_token",
            conflicts_with = "preview_token"
        )]
        preview: bool,
        /// Token from --preview; review the preview before applying the action.
        #[arg(long, required_unless_present = "preview", conflicts_with = "preview")]
        preview_token: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum ResourceCommand {
    /// List resources in a workspace, optionally filtering by name, type, or parent.
    List {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
        /// Filter resources by name.
        #[arg(long)]
        name: Option<String>,
        /// Resource type identifier.
        #[arg(long)]
        resource_type_id: Option<String>,
        /// Parent resource ID.
        #[arg(long, conflicts_with = "root")]
        parent_id: Option<String>,
        /// Use the workspace root (filter when listing; move to root when updating).
        #[arg(long)]
        root: bool,
    },
    /// Search resources by name across an organization or one workspace.
    Search {
        /// Text to search for in resource names.
        search: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: Option<String>,
    },
    /// Show resource details, including storage and current revision.
    Get {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Resource ID from resource list or search.
        resource_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Create a resource with its type and storage definitions.
    Create {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Display name.
        name: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Resource type identifier.
        #[arg(long)]
        resource_type_id: String,
        /// Schema version for the resource type.
        #[arg(long, default_value_t = 1)]
        schema_version: u32,
        /// Parent resource ID.
        #[arg(long)]
        parent_id: Option<String>,
        /// JSON object mapping storage names to definitions, for example {"content":{"kind":"yjs"}}.
        #[arg(long, default_value = "{}")]
        storage: String,
        /// Resource icon value.
        #[arg(long)]
        icon: Option<String>,
        /// Resource sort position.
        #[arg(long)]
        position: Option<i64>,
    },
    /// Rename, move, or update a resource using the current revision.
    Update {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Resource ID from resource list or search.
        resource_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Current revision from get; rejects changes if the entity has changed.
        #[arg(long)]
        revision: String,
        /// Display name.
        #[arg(long)]
        name: Option<String>,
        /// Parent resource ID.
        #[arg(long, conflicts_with = "root")]
        parent_id: Option<String>,
        /// Use the workspace root (filter when listing; move to root when updating).
        #[arg(long)]
        root: bool,
        /// Resource icon value.
        #[arg(long, conflicts_with = "clear_icon")]
        icon: Option<String>,
        /// Remove the resource icon.
        #[arg(long)]
        clear_icon: bool,
        /// Resource sort position.
        #[arg(long)]
        position: Option<i64>,
    },
    /// Preview resource deletion and obtain a confirmation token.
    #[command(hide = true)]
    PreviewDelete {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Resource ID from resource list or search.
        resource_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Preview or apply resource deletion.
    Delete {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Resource ID from resource list or search.
        resource_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Preview the action and obtain a token without applying changes.
        #[arg(
            long,
            required_unless_present = "preview_token",
            conflicts_with = "preview_token"
        )]
        preview: bool,
        /// Token from --preview; review the preview before applying the action.
        #[arg(long, required_unless_present = "preview", conflicts_with = "preview")]
        preview_token: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum YjsStorageCommand {
    /// Read the JSON representation of a Yjs document.
    Json {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Storage ID from resource get.
        storage_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
    /// Read base64-encoded Yjs state, optionally relative to a state vector.
    State {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Storage ID from resource get.
        storage_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
        /// Base64-encoded Yjs state vector to compute an incremental update.
        #[arg(long)]
        state_vector: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum KeyValueStorageCommand {
    /// List the entries in a key-value storage.
    List {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Storage ID from resource get.
        storage_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum FileCommand {
    /// Get a download URL for a file storage.
    DownloadUrl {
        /// Workspace ID from workspace list.
        #[arg(long = "workspace", alias = "workspace-id")]
        workspace_id: String,
        /// Storage ID from resource get.
        storage_id: String,
        /// Deprecated positional scope; use --organization instead.
        #[arg(hide = true)]
        organization_id: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum McpCommand {
    /// Serve MCP over stdin/stdout using the selected connection.
    Serve,
}

#[cfg(test)]
mod tests {
    use super::*;
    use clap::CommandFactory;

    #[test]
    fn destructive_commands_require_exactly_one_mode() {
        for arguments in [
            vec!["lunaris", "workspace", "delete", "w"],
            vec!["lunaris", "resource", "delete", "r", "--workspace", "w"],
            vec!["lunaris", "organization", "remove-member", "m"],
        ] {
            let error = Cli::try_parse_from(&arguments).unwrap_err();
            assert_eq!(
                error.kind(),
                clap::error::ErrorKind::MissingRequiredArgument
            );
            let help = error.to_string();
            assert!(help.contains("--preview"));
            assert!(help.contains("--preview-token"));
            let mut both = arguments;
            both.extend(["--preview", "--preview-token", "token"]);
            assert_eq!(
                Cli::try_parse_from(both).unwrap_err().kind(),
                clap::error::ErrorKind::ArgumentConflict
            );
        }
    }

    #[test]
    fn call_discovery_and_execution_are_exclusive() {
        assert!(Cli::try_parse_from(["lunaris", "call", "--list"]).is_ok());
        assert!(Cli::try_parse_from(["lunaris", "call", "get_resource", "--input", "{}"]).is_ok());
        for arguments in [
            vec!["lunaris", "call"],
            vec!["lunaris", "call", "get_resource"],
            vec!["lunaris", "call", "--input", "{}"],
            vec!["lunaris", "call", "--list", "get_resource"],
            vec!["lunaris", "call", "--list", "--input", "{}"],
        ] {
            assert!(Cli::try_parse_from(arguments).is_err());
        }
    }

    #[test]
    fn positional_workspace_syntax_is_rejected_instead_of_reinterpreted() {
        assert!(Cli::try_parse_from([
            "lunaris",
            "resource",
            "get",
            "old_workspace",
            "old_resource"
        ])
        .is_err());
        assert!(Cli::try_parse_from(["lunaris", "resource", "list", "old_workspace"]).is_err());
    }

    #[test]
    fn command_tree_is_valid() {
        Cli::command().debug_assert();
    }

    #[test]
    fn documented_examples_parse() {
        for args in [
            vec!["lunaris", "auth", "login"],
            vec!["lunaris", "workspace", "list"],
            vec!["lunaris", "resource", "search", "roadmap"],
            vec!["lunaris", "--json", "workspace", "list"],
        ] {
            assert!(Cli::try_parse_from(args).is_ok());
        }
    }
}
