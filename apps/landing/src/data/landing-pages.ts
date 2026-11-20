import { extensionCatalog } from "./extension-catalog";

export const markdownPages = [
	{
		path: "/",
		title: "Lunaris overview",
		description:
			"Offline writing, collaboration, extensions, and hosting options.",
		section: "Product",
	},
	{
		path: "/downloads",
		title: "Downloads",
		description: "Web, desktop, and CLI installation options.",
		section: "Product",
	},
	{
		path: "/pricing",
		title: "Cloud pricing",
		description: "Plans, billing, and limits for Lunaris Cloud.",
		section: "Product",
	},
	{
		path: "/enterprise",
		title: "Lunaris for enterprise",
		description:
			"Organization access controls, regional hosting, and private extensions.",
		section: "Product",
	},
	{
		path: "/extensions",
		title: "Extensions",
		description:
			"How to use extensions, with a link to the full catalog index.",
		section: "Product",
	},
	{
		path: "/self-hosted",
		title: "Self-host Lunaris",
		description: "Requirements and installation for Community Edition.",
		section: "Product",
	},
	{
		path: "/mcp",
		title: "Connect with MCP",
		description:
			"Connect an MCP client through Lunaris Cloud, Desktop, or CLI.",
		section: "Product",
	},
	...extensionCatalog.map((extension) => ({
		path: `/extensions/${extension.slug}`,
		title: extension.name,
		description: extension.description,
		extension,
	})),
	{
		path: "/compare/linear",
		title: "Lunaris vs Linear",
		description: "Writing, project documentation, and issue tracking.",
		section: "Optional",
	},
	{
		path: "/compare/obsidian",
		title: "Lunaris vs Obsidian",
		description: "Offline editing, collaboration, and workspace organization.",
		section: "Optional",
	},
	{
		path: "/compare/notion",
		title: "Lunaris vs Notion",
		description: "Offline work, data residency, and extensions.",
		section: "Optional",
	},
] as const;

export const landingPages = [
	...markdownPages,
	{ path: "/demo" },
	{ path: "/watch" },
	{ path: "/tools/word-counter" },
] as const;

export const rootIndexPath = "/llms.txt";
export const extensionIndexPath = "/extensions/llms.txt";

export function llmsIndexPath(pagePath: string) {
	return pagePath === "/extensions" || pagePath.startsWith("/extensions/")
		? extensionIndexPath
		: rootIndexPath;
}

export function markdownPath(pagePath: string) {
	return pagePath === "/" ? "/index.md" : `${pagePath}.md`;
}
