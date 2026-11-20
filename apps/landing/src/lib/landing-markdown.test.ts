import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { cliInstallMethods } from "@/data/downloads";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionQuickstartUrl } from "@/data/extensions";
import {
	extensionIndexPath,
	landingPages,
	markdownPages,
	markdownPath,
} from "@/data/landing-pages";
import { repositoryUrl, selfHostCommands } from "@/data/open-source";
import { regionDirectory } from "@/data/regions";
import { socialProfileUrls } from "@/data/social-links";
import { docsUrl, siteUrl } from "@/i18n/metadata";
import {
	renderExtensionIndex,
	renderLandingMarkdown,
	renderLlmsIndex,
} from "./landing-markdown";
import { legalDocumentUrls, trustCenterUrl } from "./legal-document-links";

function markdownLinks(markdown: string) {
	return Array.from(
		markdown.matchAll(/\]\(([^)]+)\)/g),
		([, url]) => url,
	).sort();
}

test("the landing page registry covers the HTML routes", () => {
	const pagesDirectory = fileURLToPath(
		new URL("../app/[locale]/", import.meta.url),
	);
	const routes = Array.from(
		new Bun.Glob("**/page.tsx").scanSync(pagesDirectory),
		(filename) => `/${filename.replace(/\/?page\.tsx$/, "")}`,
	);
	const staticRoutes = routes.filter((path) => path !== "/extensions/[slug]");
	const htmlOnlyRoutes = ["/demo", "/watch", "/tools/word-counter"];
	const extensionRoutes = extensionCatalog.map(
		({ slug }) => `/extensions/${slug}`,
	);

	expect(landingPages.map(({ path }) => path).sort()).toEqual(
		[...staticRoutes, ...extensionRoutes].sort(),
	);
	expect(
		markdownPages.filter(({ path }) => htmlOnlyRoutes.includes(path)),
	).toEqual([]);
});

test("the root index links to selected companions and the scoped catalog", () => {
	const index = renderLlmsIndex();
	expect(index).toStartWith("# Lunaris\n\n> ");
	const socialSection = index
		.split("## Social networks\n\n")[1]
		?.split("\n## ")[0];
	expect(socialSection).toContain(`[Lunaris on GitHub](${repositoryUrl})`);
	expect(markdownLinks(index)).toEqual(
		[
			...markdownPages
				.filter((page) => "section" in page && !("extension" in page))
				.map(({ path }) => `${siteUrl}${markdownPath(path)}`),
			`${docsUrl}/getting-started`,
			docsUrl,
			`${siteUrl}/downloads#cli`,
			`${siteUrl}${extensionIndexPath}`,
			extensionQuickstartUrl,
			repositoryUrl,
			...Object.values(legalDocumentUrls),
			trustCenterUrl,
			...Object.values(socialProfileUrls),
		].sort(),
	);
});

test("the extension index links to every extension companion", () => {
	const catalogIndex = renderExtensionIndex();
	expect(catalogIndex).toStartWith("# Lunaris extension catalog\n\n> ");
	expect(markdownLinks(catalogIndex)).toEqual(
		extensionCatalog
			.map(({ slug }) => `${siteUrl}${markdownPath(`/extensions/${slug}`)}`)
			.sort(),
	);
});

test.each(markdownPages)("Markdown companion for $path", async (page) => {
	const body = await renderLandingMarkdown(page);
	expect(body).toStartWith("# ");
	expect(body).toEndWith(`[View the web page](${siteUrl}${page.path})\n`);
	const localPaths = markdownLinks(body)
		.map((href) => new URL(href, siteUrl))
		.filter(({ origin }) => origin === siteUrl)
		.map(({ pathname }) => pathname.replace(/\/$/, ""));
	expect(localPaths).not.toContain("/demo");
	if (page.path === "/extensions") {
		expect(body).toContain(`${siteUrl}${extensionIndexPath}`);
		expect(body).not.toContain(
			`${siteUrl}/extensions/${extensionCatalog[0]?.slug}.md`,
		);
	}
});

test.each([
	["/downloads", cliInstallMethods.map(({ command }) => command)],
	["/self-hosted", Object.values(selfHostCommands)],
] as const)(
	"%s Markdown matches the web installer commands",
	async (path, commands) => {
		const page = markdownPages.find((entry) => entry.path === path);
		if (!page) throw new Error(`Missing companion for ${path}`);
		const body = await renderLandingMarkdown(page);

		for (const command of commands) {
			expect(body).toContain(`\n${command}\n`);
		}
	},
);

test("pricing Markdown includes costs, limits, features, and billing terms", async () => {
	const page = markdownPages.find(({ path }) => path === "/pricing");
	if (!page) throw new Error("Missing pricing companion");
	const body = await renderLandingMarkdown(page);

	expect(body).toContain("$10 per member per month, or $8");
	expect(body).toContain("$20 per member per month, or $16");
	expect(body).toContain("| Feature | Free | Plus | Business | Enterprise |");
	expect(body).toContain(
		"| Members (including owner) | 3 | 10 | Unlimited | Unlimited |",
	);
	expect(body).toContain(
		"| Maximum file size | 25 MB | 500 MB | 5 GB | 5 GB |",
	);
	expect(body).toContain(
		"| SSO & SCIM | Not included | Not included | Not included | Included |",
	);
	expect(body).toContain("Cancellation returns the organization to Free");
	expect(body).toContain("Uploads that increase storage pause");
	expect(body).toContain("### Enterprise\n\nCustom");
});

test.each([
	[
		"/compare/linear",
		"Linear",
		"Organizing documents",
		"https://linear.app/docs/documents",
	],
	[
		"/compare/notion",
		"Notion",
		"Working offline",
		"https://www.notion.com/help/use-pages-offline",
	],
	[
		"/compare/obsidian",
		"Obsidian",
		"Editing together",
		"https://obsidian.md/help/sync/collaborate",
	],
])(
	"%s Markdown includes the feature table and sources",
	async (path, product, feature, source) => {
		const page = markdownPages.find((entry) => entry.path === path);
		if (!page) throw new Error(`Missing companion for ${path}`);
		const body = await renderLandingMarkdown(page);

		expect(body).toContain(`| Feature | Lunaris | ${product} |`);
		expect(body).toContain(`| ${feature} |`);
		expect(body).toContain(`](${source})`);
	},
);

test("MCP Markdown includes client snippets for available cloud regions, Desktop, and CLI", async () => {
	const page = markdownPages.find(({ path }) => path === "/mcp");
	if (!page) throw new Error("Missing MCP companion");
	const body = await renderLandingMarkdown(page);

	for (const region of regionDirectory.regions) {
		if (region.status === "available") {
			const endpoint = `${new URL(region.manifestUrl).origin}/mcp`;
			expect(body).toContain(`### ${region.displayName}`);
			expect(body).toContain(`transport: http\nurl: ${endpoint}`);
			expect(body).toContain(
				`claude mcp add --transport http lunaris ${endpoint}`,
			);
			expect(body).toContain(`codex mcp add lunaris --url ${endpoint}`);
			expect(body).toContain(`"url": "${endpoint}"`);
		} else {
			expect(body).not.toContain(`### ${region.displayName}`);
		}
	}
	const desktop = "/Applications/Lunaris.app/Contents/MacOS/Lunaris";
	expect(body).toContain(`command: ${desktop}\nargs: mcp serve --access read`);
	expect(body).toContain(
		`claude mcp add --transport stdio lunaris -- ${desktop} mcp serve --access read`,
	);
	expect(body).toContain(
		`codex mcp add lunaris -- ${desktop} mcp serve --access read`,
	);
	expect(body).toContain(`"command": "${desktop}"`);
	expect(body).toContain("Connected agents");

	const cli = body.split("## CLI setup\n\n")[1];
	expect(cli).toContain(`${siteUrl}/downloads#cli`);
	expect(cli).toContain("lunaris auth login");
	expect(cli).toContain("command: lunaris\nargs: mcp serve");
	expect(cli).toContain("codex mcp add lunaris -- lunaris mcp serve");
	expect(cli).toContain('"command": "lunaris"');
});
