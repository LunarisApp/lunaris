---
name: with-screenshot
description: Capture screenshots of Lunaris features in local dev via agent-browser. Use when user wants to see a feature being built, asks for a UI screenshot, requests before/after visual proof, wants quick visual QA, or asks to show a route or interaction state from local web app.
---

# With Screenshot

Thin Lunaris wrapper around [agent-browser](../agent-browser/SKILL.md).

## Defaults

- Default URL `http://localhost:5173` if user gives none.
- Desktop `1280x720` first. Mobile only if requested or clearly useful.
- Reset desktop with `agent-browser set viewport 1280 720` — kill leaked device emulation.
- One-off shots: `agent-browser screenshot` default temp path. Report file path.
- `--full` only when page height matters.
- `--annotate` only when user wants clickable refs or review context.

## Workflow

0. **Ensure dev stack up.** Quick probe: `curl -sf http://localhost:5173 >/dev/null` (frontend) + `curl -sf http://localhost:3000/v1/health >/dev/null` (backend). Either fail → invoke [run-locally](../run-locally/SKILL.md) skill to spin up env (env files, docker services, `bun run dev`). Then re-probe before continuing.

1. **Confirm target.** User gives route → open it. Names feature only → infer route from repo before asking.

2. **Reach app.** `agent-browser open <url>`. Dev server down → stop, report exact blocker.

3. **Wait stable.** `agent-browser wait --load networkidle`. Needs interaction first → `snapshot -i`, click refs, wait again.

4. **Verify URL — auth redirect check.** Run `agent-browser get url`. Most routes gated by `AuthGuard` → silent redirect to `/auth` if no session. If URL contains `/auth` AND requested route did not → **STOP**. Do NOT screenshot. Capture = sign-in page, not feature. Report: "Route `<route>` needs login. Redirected to `/auth`. Cannot capture `<feature>`." Suggest: sign in via `snapshot -i` on `/auth` then click flow, OR use public route, OR use agent-browser auth state/profile/session-name.

5. **Capture smallest shot.** Viewport first. `--full` only for long pages/docs. Extra shots only if clear value.

6. **Report.** File path + route + viewport + any interaction taken.

## Common Commands

```bash
# Direct route capture (with auth check)
agent-browser open http://localhost:5173 \
  && agent-browser wait --load networkidle \
  && agent-browser get url   # bail if contains /auth
agent-browser screenshot

# Full-page (with auth check)
agent-browser open http://localhost:5173 \
  && agent-browser wait --load networkidle \
  && agent-browser get url   # bail if contains /auth
agent-browser screenshot --full

# Interaction before capture
agent-browser open http://localhost:5173/auth \
  && agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser click @e1 && agent-browser wait --load networkidle && agent-browser screenshot

# Mobile (with auth check)
agent-browser set device "iPhone 14" \
  && agent-browser open http://localhost:5173 \
  && agent-browser wait --load networkidle \
  && agent-browser get url   # bail if contains /auth
agent-browser screenshot

# Reset desktop
agent-browser set viewport 1280 720
```

## Guardrails

- Always `agent-browser get url` after navigation. `AuthGuard` redirects silently. Capturing redirect = wrong shot. Bail + report.
- No fake auth. Login gate + no session → say so.
- No redundant shots. One good shot. More only if asked.
- Never ambiguous result. Always name what was captured + save path.
