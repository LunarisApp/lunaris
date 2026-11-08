# Capture verified UI

Read [agent-browser](../../agent-browser/SKILL.md) for browser commands.

1. Resolve the requested route from source. Check app health using [Run locally](run-locally.md); start missing components if needed.
2. Set desktop viewport to `1280x720` before navigation to clear previous device emulation. Use mobile when requested or useful.
3. Open the route and run `agent-browser get url`. If redirected to `/auth`, complete an authorized login flow or report the login blocker.
4. Reach the requested state using `snapshot -i` and element waits. After navigation, recheck the URL. Confirm visible content matches the requested feature before capture; use network-idle waits only when appropriate.
5. Save a useful viewport screenshot under `.context/`. Use `--full` when page height matters or `--annotate` when interaction references help.
6. Embed the image in the final response using an absolute Markdown path. Name the route, viewport, and interactions needed to reach it.

```sh
mkdir -p .context
agent-browser screenshot .context/feature.png
```

A capture is complete only when the screenshot shows the requested state. If auth,
loading, or a runtime error prevents it, report the exact blocker and identify any
diagnostic image as such.
