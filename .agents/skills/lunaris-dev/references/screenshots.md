# Verify and capture UI

Use [agent-browser](../../agent-browser/SKILL.md) for browser commands.

1. Probe web and API health; use [Run locally](run-locally.md) if either is unavailable.
2. Open the requested route. Infer routes from repository code before asking.
3. Set desktop viewport to `1280x720` to clear previous device emulation. Use mobile when requested or useful.
4. Wait for the relevant UI to settle. Use `snapshot -i` and element waits for interactions; use `wait --load networkidle` only when appropriate.
5. Run `agent-browser get url` after navigation. If a protected route redirects to `/auth`, complete an authorized login flow or report the login blocker. Never present the sign-in page as the requested feature.
6. Capture one useful viewport screenshot under `.context/`. Use `--full` when page height matters and `--annotate` when interaction references help.
7. Embed the screenshot in the final response. Include route, viewport, and any interaction needed to reach the captured state.

```sh
mkdir -p .context
agent-browser set viewport 1280 720
agent-browser open http://localhost:5173
agent-browser get url
# Wait for the target UI and verify the route before capture.
agent-browser screenshot .context/feature.png
```

Never fabricate authentication or feature state. Report the exact blocker if capture cannot proceed.
