use clap::{Args, Parser, Subcommand, ValueEnum};

use crate::discovery::DEFAULT_SERVER_DIRECTORY_URL;

#[derive(Debug, Parser)]
#[command(
    name = "lunaris",
    version,
    long_version = env!("LUNARIS_BUILD_VERSION"),
    about = "Control Lunaris from scripts and AI agents"
)]
pub struct Cli {
    #[arg(long, global = true)]
    pub server: Option<String>,
    #[arg(long, global = true)]
    pub organization: Option<String>,
    #[arg(long, global = true)]
    pub base_url: Option<String>,
    #[arg(long, global = true, conflicts_with = "consistency")]
    pub allow_stale: bool,
    #[arg(long, global = true, value_enum)]
    pub consistency: Option<Consistency>,
    #[arg(long, global = true)]
    pub idempotency_key: Option<String>,
    #[arg(long, global = true)]
    pub json: bool,
    #[arg(long, global = true, default_value_t = 30_000)]
    pub timeout: u64,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    Server {
        #[command(subcommand)]
        command: ServerCommand,
    },
    Organization {
        #[command(subcommand)]
        command: OrganizationCommand,
    },
    Workspace {
        #[command(subcommand)]
        command: WorkspaceCommand,
    },
    Resource {
        #[command(subcommand)]
        command: ResourceCommand,
    },
    YjsStorage {
        #[command(subcommand)]
        command: YjsStorageCommand,
    },
    KeyValueStorage {
        #[command(subcommand)]
        command: KeyValueStorageCommand,
    },
    File {
        #[command(subcommand)]
        command: FileCommand,
    },
    Mcp {
        #[command(subcommand)]
        command: McpCommand,
    },
    /// Invoke any generated agent operation with a JSON object.
    Call {
        operation: String,
        #[arg(long)]
        input: String,
    },
}

#[derive(Clone, Debug, ValueEnum)]
pub enum Access {
    Read,
    Write,
    Full,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Consistency {
    Adaptive,
    Cached,
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
    Login {
        #[arg(long, value_enum, default_value = "full")]
        access: Access,
        #[arg(long)]
        client_name: Option<String>,
        #[arg(long, default_value_t = 120)]
        pair_timeout: u64,
        #[arg(long)]
        no_default_organization: bool,
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
        #[arg(long, default_value_t = 300)]
        login_timeout: u64,
        #[arg(long)]
        no_open: bool,
    },
    SetKey,
    SetOrganization {
        organization_id: String,
    },
    Status,
    Logout,
}

#[derive(Debug, Subcommand)]
pub enum ServerCommand {
    List {
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
    },
    Use {
        server_id: String,
        #[arg(long, default_value = DEFAULT_SERVER_DIRECTORY_URL)]
        directory_url: String,
    },
}

#[derive(Clone, Debug, Args)]
pub struct PageArgs {
    #[arg(long, default_value_t = 50)]
    pub limit: u16,
    #[arg(long)]
    pub cursor: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum OrganizationCommand {
    List(PageArgs),
    Get {
        organization_id: Option<String>,
    },
    Update {
        organization_id: Option<String>,
        #[arg(long)]
        revision: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long, conflicts_with = "clear_logo")]
        logo: Option<String>,
        #[arg(long)]
        clear_logo: bool,
    },
    Members {
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
    },
    Invite {
        email: String,
        organization_id: Option<String>,
        #[arg(long, value_parser = ["admin", "member"])]
        role: String,
    },
    PreviewRemoveMember {
        member_id: String,
        organization_id: Option<String>,
    },
    RemoveMember {
        member_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        preview_token: String,
    },
}

#[derive(Clone, Debug, ValueEnum)]
pub enum Visibility {
    Local,
    Shared,
}

#[derive(Debug, Subcommand)]
pub enum WorkspaceCommand {
    List {
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
    },
    Get {
        workspace_id: String,
        organization_id: Option<String>,
    },
    Create {
        name: String,
        slug: String,
        organization_id: Option<String>,
        #[arg(long, value_enum, default_value = "shared")]
        visibility: Visibility,
    },
    Update {
        workspace_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        revision: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        slug: Option<String>,
    },
    PreviewDelete {
        workspace_id: String,
        organization_id: Option<String>,
    },
    Delete {
        workspace_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        preview_token: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum ResourceCommand {
    List {
        workspace_id: String,
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
        #[arg(long)]
        name: Option<String>,
        #[arg(long)]
        resource_type_id: Option<String>,
        #[arg(long, conflicts_with = "root")]
        parent_id: Option<String>,
        #[arg(long)]
        root: bool,
    },
    Search {
        search: String,
        organization_id: Option<String>,
        #[command(flatten)]
        page: PageArgs,
        #[arg(long)]
        workspace_id: Option<String>,
    },
    Get {
        workspace_id: String,
        resource_id: String,
        organization_id: Option<String>,
    },
    Create {
        workspace_id: String,
        name: String,
        organization_id: Option<String>,
        #[arg(long)]
        resource_type_id: String,
        #[arg(long, default_value_t = 1)]
        schema_version: u32,
        #[arg(long)]
        parent_id: Option<String>,
        /// JSON object mapping storage names to definitions, for example {"content":{"kind":"yjs"}}.
        #[arg(long, default_value = "{}")]
        storage: String,
        #[arg(long)]
        icon: Option<String>,
        #[arg(long)]
        position: Option<i64>,
    },
    Update {
        workspace_id: String,
        resource_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        revision: String,
        #[arg(long)]
        name: Option<String>,
        #[arg(long, conflicts_with = "root")]
        parent_id: Option<String>,
        #[arg(long)]
        root: bool,
        #[arg(long, conflicts_with = "clear_icon")]
        icon: Option<String>,
        #[arg(long)]
        clear_icon: bool,
        #[arg(long)]
        position: Option<i64>,
    },
    PreviewDelete {
        workspace_id: String,
        resource_id: String,
        organization_id: Option<String>,
    },
    Delete {
        workspace_id: String,
        resource_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        preview_token: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum YjsStorageCommand {
    Json {
        workspace_id: String,
        storage_id: String,
        organization_id: Option<String>,
    },
    State {
        workspace_id: String,
        storage_id: String,
        organization_id: Option<String>,
        #[arg(long)]
        state_vector: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum KeyValueStorageCommand {
    List {
        workspace_id: String,
        storage_id: String,
        organization_id: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum FileCommand {
    DownloadUrl {
        workspace_id: String,
        storage_id: String,
        organization_id: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum McpCommand {
    Serve,
}
