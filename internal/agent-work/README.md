# Agent Work

One agent implementation, two UI presentations:

- `src/page.tsx`: full tool entry point, selects `workbench`.
- `src/panel.tsx`: Documents entry point, selects `panel`.
- `src/root.tsx`: resolves account/organization scope and resets the view when it changes.
- `src/view.tsx`: shared conversation commands, composer, authentication flow, transcript, approvals, and presentation selection.
- `src/composer.tsx`, `src/auth-form.tsx`, `src/approvals.tsx`: shared presentation components controlled by the view.
- `src/use-agent-work.ts`: shared connection lifecycle and state.
- `src/message.tsx`: shared Markdown, timestamps, copy actions, and tool results.
- `src/layout.tsx`: fixed Dockview panels for the workbench presentation.

The panel presentation keeps one chat view, a conversation picker, and inline approvals.
The workbench presentation places those same controls in Conversations, Chat, and Activity panels.
Neither presentation implements its own model provider or tool execution.

## Documents integration

Agent Work is a built-in Documents tool, not an extension. The workspace host registers
the lazy panel in `internal/workspaces/src/features/agent-work`; its launcher opens the
`agent-work` tool. It is also available through the mobile tool route.

Compatibility reads map saved `lunaris.ai-chat` panels to `system-agent-work`;
old Assistant URLs redirect to the built-in tool. New state uses the new IDs.

## Runtime

Both presentations use `@repo/platform`'s Agent Work interface. Desktop provides the Pi SDK
sidecar in `apps/desktop/agent-work`, including ChatGPT authentication, session storage,
Lunaris resource tools, and approval enforcement. Web uses the same unavailable-runtime
state until a web-compatible runtime is supplied.

`authenticated` describes the ChatGPT account; `runtimeReady` describes the running
connection. Shared platform schemas define commands, state, and message variants.
Tool messages require a call ID, name, and status. The desktop's private
`agent-work/protocol.ts` adds request IDs and tool transport events; both sides
validate incoming data before handling it.

## Rollout

The full tool and Documents mini panel share the `agent-work` feature flag.
The API evaluates it for the signed-in user and includes it in the entitlement
snapshot. Both launchers and the shared root require access; direct links and
restored panels cannot bypass it. Access defaults to off when missing, pending,
offline, or evaluation fails. The flag is independent of the subscription plan.
