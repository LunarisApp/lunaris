import type { DataRegion } from "./regions";

export type HarnessId = "mcp" | "claude" | "codex" | "cursor";

const desktopMcpCommand = "/Applications/Lunaris.app/Contents/MacOS/Lunaris";
const desktopMcpArguments = ["mcp", "serve", "--access", "read"] as const;

export function mcpUrl(region: DataRegion) {
	if (region.status === "planned") return "";

	const url = new URL(region.manifestUrl);
	url.pathname = "/mcp";
	url.search = "";
	url.hash = "";
	return url.toString();
}

export function localSetupSnippet(
	harness: HarnessId,
	connection: "desktop" | "cli",
) {
	const desktop = connection === "desktop";
	const command = desktop ? desktopMcpCommand : "lunaris";
	const args = desktop ? desktopMcpArguments : ["mcp", "serve"];
	const argumentsList = args.join(" ");

	if (harness === "mcp") {
		return `transport: stdio
command: ${command}
args: ${argumentsList}`;
	}
	if (harness === "claude") {
		return `claude mcp add --transport stdio lunaris -- ${command} ${argumentsList}`;
	}
	if (harness === "codex") {
		return `codex mcp add lunaris -- ${command} ${argumentsList}`;
	}
	return JSON.stringify(
		{
			mcpServers: {
				lunaris: {
					command,
					args,
				},
			},
		},
		null,
		2,
	);
}

export function cloudSetupSnippet(harness: HarnessId, url: string) {
	if (harness === "mcp") return `transport: http\nurl: ${url}`;
	if (harness === "claude")
		return `claude mcp add --transport http lunaris ${url}`;
	if (harness === "codex") return `codex mcp add lunaris --url ${url}`;
	return `{
  "mcpServers": {
    "lunaris": {
      "url": "${url}"
    }
  }
}`;
}
