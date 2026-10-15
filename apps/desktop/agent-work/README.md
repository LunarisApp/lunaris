# Agent Work

Agent Work runs Pi SDK in a bundled Bun sidecar. The desktop app provides a conversation sidebar, streaming chat, model selection, saved local sessions, stop, and resource-change approval.

## Use

1. Complete [desktop setup](../README.md#local-development), then start it with
   `bun run dev:desktop` from the repository root.
2. Open **Agent Work**, then **Connect ChatGPT**.
3. Complete Pi's OpenAI Codex sign-in in your browser using an eligible ChatGPT subscription. If the callback cannot reach the app, paste the redirect URL into Agent Work.
4. Ask about your Lunaris workspace resources. Inspect and approve proposed changes before they run.

The web app explains that this runtime requires desktop. API keys are not required for the subscription login. Model availability and usage limits depend on the account and provider.

## Panels

Agent Work has Conversations, Chat, and Activity panels. Activity shows tool
results and pending approvals. Mini uses one chat panel with inline approvals.
Panel widths persist per API, user, and organization; narrow windows use tabs.

## Boundaries

- Pi packages are pinned to `0.73.1`, which supplies `openai-codex` OAuth and the session SDK used here.
- The sidecar receives only approved resource tools. Filesystem, shell, Pi extensions, skills, and local context discovery are disabled.
- The desktop bridge validates tool input using the shared agent contracts and injects the active organization. Existing permission-aware resource routing handles access.
- Reads run automatically. Mutations require an explicit approval, claimed once to prevent duplicate clicks from repeating a write.
- OAuth credentials and sessions stay under the OS app-data directory, in `agent-work/<scope hash>`. The scope contains API URL, user, and organization. Directories use private permissions on Unix; credentials are stored by Pi, not in the frontend or repository.
- Prompts and resource tool results are sent to the connected model provider. Disconnect removes the stored provider credential; conversation history remains locally.
- One Agent Work window runs at a time. Leaving the route stops its sidecar and current turn. Reopen saved conversations from the sidebar.

## Build and verify

`bun run --cwd apps/desktop build:agent` compiles the host sidecar. Tauri hooks build it automatically. `TAURI_ENV_TARGET_TRIPLE` selects a cross-build target; universal macOS builds compile both architectures and combine them with `lipo`.

Run desktop `typecheck` and `test`, the `@repo/agent-work` UI tests, and `cargo check -p lunaris-desktop` after building the sidecar. A live subscription response requires interactive ChatGPT sign-in; fixture UI tests do not verify provider access.

## Licensing

Lunaris-owned integration code uses [MIT](../../../LICENSE). Pi retains
its MIT license; Bun and its embedded libraries retain their own licenses.
Sidecar builds generate per-architecture npm notices and a runtime source
reference in the desktop app’s `src-tauri/notices` directory, packaged with the app. See
[third-party notices](../../../THIRD-PARTY-NOTICES.md) for unresolved runtime
source and relinking requirements.
