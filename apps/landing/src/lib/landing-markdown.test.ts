import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionQuickstartUrl } from "@/data/extensions";
import {
	extensionIndexPath,
	landingPages,
	markdownPages,
	markdownPath,
} from "@/data/landing-pages";
import { repositoryUrl } from "@/data/open-source";
import { regionDirectory } from "@/data/regions";
import { socialProfileUrls } from "@/data/social-links";
import { docsUrl, siteUrl } from "@/i18n/metadata";
import {
	renderExtensionIndex,
	renderLandingMarkdown,
	renderLlmsIndex,
} from "./landing-markdown";
import { legalDocumentUrls, trustCenterUrl } from "./legal-document-links";

function indexUrls(index: string) {
	return Array.from(index.matchAll(/\]\(([^)]+)\)/g), ([, url]) => url).sort();
}

test("the root and extension indexes cover their respective pages", () => {
	const pagesDirectory = fileURLToPath(
		new URL("../app/[locale]/", import.meta.url),
	);
	const routes = Array.from(
		new Bun.Glob("**/page.tsx").scanSync(pagesDirectory),
		(filename) => `/${filename.replace(/\/?page\.tsx$/, "")}`,
	);
	const staticRoutes = routes.filter((path) => path !== "/extensions/[slug]");
	const htmlOnlyRoutes = ["/demo", "/watch", "/tools/word-counter"];
	const rootRoutes = staticRoutes.filter(
		(path) => !htmlOnlyRoutes.includes(path),
	);
	const extensionRoutes = extensionCatalog.map(
		({ slug }) => `/extensions/${slug}`,
	);

	expect(landingPages.map(({ path }) => path).sort()).toEqual(
		[...staticRoutes, ...extensionRoutes].sort(),
	);
	expect(markdownPages.map(({ path }) => path).sort()).toEqual(
		[...rootRoutes, ...extensionRoutes].sort(),
	);
	const index = renderLlmsIndex();
	expect(index).toStartWith("# Lunaris\n\n> ");
	const socialSection = index
		.split("## Social networks\n\n")[1]
		?.split("\n## ")[0];
	expect(socialSection).toContain(`[Lunaris on GitHub](${repositoryUrl})`);
	expect(indexUrls(index)).toEqual(
		[
			...rootRoutes.map((path) => `${siteUrl}${markdownPath(path)}`),
			`${docsUrl}/getting-started`,
			docsUrl,
			`${siteUrl}/downloads#cli`,
			extensionQuickstartUrl,
			repositoryUrl,
			...Object.values(legalDocumentUrls),
			trustCenterUrl,
			...Object.values(socialProfileUrls),
		].sort(),
	);
	const catalogIndex = renderExtensionIndex();
	expect(catalogIndex).toStartWith("# Lunaris extension catalog\n\n> ");
	expect(indexUrls(catalogIndex)).toEqual(
		extensionRoutes.map((path) => `${siteUrl}${markdownPath(path)}`).sort(),
	);
});

test.each(markdownPages)("Markdown companion for $path", async (page) => {
	const body = await renderLandingMarkdown(page);
	expect(body).toStartWith("# ");
	expect(body).toEndWith(`[View the web page](${siteUrl}${page.path})\n`);
	if (page.path === "/extensions") {
		expect(body).toContain(`${siteUrl}${extensionIndexPath}`);
		expect(body).not.toContain(
			`${siteUrl}/extensions/${extensionCatalog[0]?.slug}.md`,
		);
	}
});

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
	expect(body).not.toContain(`${siteUrl}/demo`);
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
