import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	extensionDocsUrl,
	extensionQuickstartUrl,
	extensionsCopy,
} from "@/data/extensions";
import {
	extensionIndexPath,
	markdownPages,
	markdownPath,
} from "@/data/landing-pages";
import { cloudSetupSnippet, localSetupSnippet, mcpUrl } from "@/data/mcp-setup";
import { repositoryUrl } from "@/data/open-source";
import { getPlanComparison, getPlans } from "@/data/pricing";
import {
	getLinearComparison,
	getNotionComparison,
	getObsidianComparison,
} from "@/data/product-comparisons";
import { regionDirectory } from "@/data/regions";
import { socialProfileUrls } from "@/data/social-links";
import { defaultLocale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { docsUrl, siteUrl } from "@/i18n/metadata";
import { legalDocumentUrls, trustCenterUrl } from "./legal-document-links";

type MarkdownPage = (typeof markdownPages)[number];

const comparisons = {
	"/compare/linear": getLinearComparison,
	"/compare/notion": getNotionComparison,
	"/compare/obsidian": getObsidianComparison,
};

function markdownPageLink({ path, title, description }: MarkdownPage) {
	return `- [${title}](${siteUrl}${markdownPath(path)}): ${description}`;
}

export function renderLlmsIndex() {
	const sections = new Map<string, string[]>([
		["Product", []],
		[
			"Resources",
			[
				`- [Getting started](${docsUrl}/getting-started): Set up an account and create your first workspace.`,
				`- [Lunaris documentation](${docsUrl}): User guides, troubleshooting, and developer reference.`,
				`- [Download the Lunaris CLI](${siteUrl}/downloads#cli): Install with scripts on macOS, Linux, and Windows, or with Homebrew on macOS.`,
				`- [Extension catalog](${siteUrl}${extensionIndexPath}): Browse built-in and installable extensions.`,
				`- [Extension SDK quickstart](${extensionQuickstartUrl}): Build and test a Lunaris extension.`,
			],
		],
		[
			"Legal and trust",
			[
				`- [Privacy Policy](${legalDocumentUrls.privacy}): How Lunaris handles personal data.`,
				`- [Cookie Policy](${legalDocumentUrls.cookies}): How Lunaris uses cookies.`,
				`- [Terms of Service](${legalDocumentUrls.terms}): Terms for using Lunaris services.`,
				`- [Subprocessors](${legalDocumentUrls.subprocessors}): Third parties that process data for Lunaris.`,
				`- [Trust Center](${trustCenterUrl}): Security, privacy, and compliance information.`,
			],
		],
		[
			"Social networks",
			[
				`- [Lunaris on GitHub](${repositoryUrl})`,
				...Object.entries(socialProfileUrls).map(
					([name, url]) => `- [Lunaris on ${name}](${url})`,
				),
			],
		],
		["Optional", []],
	]);
	for (const page of markdownPages) {
		if (!("section" in page)) continue;
		const links = sections.get(page.section) ?? [];
		links.push(markdownPageLink(page));
		sections.set(page.section, links);
	}

	const blocks = [
		"# Lunaris",
		"> Lunaris is an offline-first word processor with real-time collaboration, extensions, and a self-hosted Community Edition.",
		...Array.from(
			sections,
			([heading, links]) => `## ${heading}\n\n${links.join("\n")}`,
		),
	];
	return `${blocks.join("\n\n")}\n`;
}

export function renderExtensionIndex() {
	const links = markdownPages.filter((page) => "extension" in page);
	const blocks = [
		"# Lunaris extension catalog",
		"> Built-in and installable tools for Lunaris workspaces.",
		"## Extensions",
		links.map(markdownPageLink).join("\n"),
	];
	return `${blocks.join("\n\n")}\n`;
}

function markdownTable(headers: readonly string[], rows: readonly string[][]) {
	function row(cells: readonly string[]) {
		const escaped = cells.map((cell) => cell.replaceAll("|", "\\|"));
		return `| ${escaped.join(" | ")} |`;
	}

	return [row(headers), row(headers.map(() => "---")), ...rows.map(row)].join(
		"\n",
	);
}

function renderPricing(dict: Dictionary) {
	const { all: plans } = getPlans(dict, defaultLocale);
	const pricing = dict.pricingPage;
	const { fileStorage, storageFull } = dict.faqs.items;
	const planDetails = plans.map(
		({ id, name, price, period, subheadline, features, ctaLabel, href }) =>
			[
				`### ${name}`,
				period
					? `${price.monthly} per member per month, or ${price.yearly} per member per month when billed annually.`
					: price.monthly,
				subheadline,
				features.map((feature) => `- ${feature}`).join("\n"),
				...(id === "enterprise"
					? []
					: [`[${ctaLabel}](${new URL(href, siteUrl)})`]),
			].join("\n\n"),
	);
	const headers = ["Feature", ...plans.map(({ name }) => name)];
	const comparison = getPlanComparison(dict).map(({ title, features }) => {
		const rows = features.map(({ name, values }) => [
			name,
			...plans.map((plan) => {
				const cell = values[plan.id];
				if (typeof cell === "string") return cell;
				return cell ? pricing.labels.included : pricing.labels.notIncluded;
			}),
		]);
		return `### ${title}\n\n${markdownTable(headers, rows)}`;
	});

	return [
		"## Plans",
		...planDetails,
		`## ${pricing.comparisonTable.heading}`,
		...comparison,
		"## Billing and plan changes",
		pricing.billingNote,
		...pricing.details.map(({ title, body }) => `### ${title}\n\n${body}`),
		"## File storage",
		pricing.storage.note,
		...[fileStorage, storageFull].map(
			({ question, answer }) => `### ${question}\n\n${answer}`,
		),
		`[Self-host Community Edition](${siteUrl}/self-hosted.md)`,
	].join("\n\n");
}

function renderComparison(
	comparison: ReturnType<(typeof comparisons)[keyof typeof comparisons]>,
) {
	const { copy, products, groups, sources } = comparison;
	const headers = ["Feature", ...products.map(({ name }) => name)];
	return [
		`## ${copy.table.heading}`,
		...groups.map(
			({ title, features }) =>
				`### ${title}\n\n${markdownTable(
					headers,
					features.map(({ name, values }) => [name, ...values]),
				)}`,
		),
		"## Sources",
		copy.sources.intro,
		sources.map(({ label, href }) => `- [${label}](${href})`).join("\n"),
	].join("\n\n");
}

function renderMcpSetup() {
	const clients = [
		{ id: "mcp", name: "Generic MCP client", language: "text" },
		{ id: "claude", name: "Claude Code", language: "sh" },
		{ id: "codex", name: "Codex", language: "sh" },
		{ id: "cursor", name: "Cursor", language: "json" },
	] as const;

	const cloud = regionDirectory.regions
		.filter((region) => region.status === "available")
		.flatMap((region) => {
			const endpoint = mcpUrl(region);
			return [
				`### ${region.displayName}`,
				...clients.map(
					({ id, name, language }) =>
						`#### ${name}\n\n${codeBlock(language, cloudSetupSnippet(id, endpoint))}`,
				),
			];
		});
	return [
		...(cloud.length
			? [
					"## Cloud setup",
					"Use the commands or configuration for the region where you created your account. In Cursor, add the configuration to `.cursor/mcp.json`.",
					...cloud,
				]
			: []),
		"## macOS Desktop setup",
		"The examples request read-only access. In Cursor, add the configuration to `.cursor/mcp.json`.",
		...clients.map(
			({ id, name, language }) =>
				`### ${name}\n\n${codeBlock(language, localSetupSnippet(id, "desktop"))}`,
		),
		"## CLI setup",
		`[Install the Lunaris CLI](${siteUrl}/downloads#cli) and run \`lunaris auth login\` to choose a server and sign in. In Cursor, add the configuration to \`.cursor/mcp.json\`.`,
		...clients.map(
			({ id, name, language }) =>
				`### ${name}\n\n${codeBlock(language, localSetupSnippet(id, "cli"))}`,
		),
	].join("\n\n");
}

function codeBlock(language: string, content: string) {
	return `\`\`\`${language}\n${content}\n\`\`\``;
}

function renderExtension(page: Extract<MarkdownPage, { extension: unknown }>) {
	const { extension } = page;
	const copy = extensionsCopy[defaultLocale];
	const description = copy.items[extension.slug];
	const summary = description?.description ?? extension.description;
	const about = description?.about ?? extension.longDescription;

	return [
		`# ${extension.name}`,
		summary,
		...(about && about !== summary ? [about] : []),
		"## Use this extension",
		extension.builtIn ? copy.builtInNote : copy.catalogNote,
		[
			`- Type: ${extension.builtIn ? copy.builtIn : copy.catalog}`,
			`- Developer: ${extension.developer}`,
			`- Version: ${extension.version}`,
			`- Plugin API: ${extension.api}`,
			`- [Manage extensions](${extensionDocsUrl})`,
			`- [Source code](${extension.repository})`,
			...(extension.website ? [`- [Website](${extension.website})`] : []),
		].join("\n"),
		"## Permissions",
		extension.permissions
			.map((permission) => `- ${copy.permissions[permission]}`)
			.join("\n") || "This extension declares no permissions.",
	].join("\n\n");
}

export async function renderLandingMarkdown(page: MarkdownPage) {
	const filename = join(process.cwd(), "src/markdown", markdownPath(page.path));
	let body: string;
	try {
		body = await readFile(filename, "utf8");
	} catch (error) {
		if (
			!("extension" in page) ||
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}
		body = renderExtension(page);
	}

	let details: string | undefined;
	switch (page.path) {
		case "/pricing":
			details = renderPricing(await getDictionary(defaultLocale));
			break;
		case "/compare/linear":
		case "/compare/notion":
		case "/compare/obsidian":
			details = renderComparison(
				comparisons[page.path](await getDictionary(defaultLocale)),
			);
			break;
		case "/mcp":
			details = renderMcpSetup();
			break;
		case "/extensions":
			details = `[Browse the extension catalog](${siteUrl}${extensionIndexPath})`;
			break;
	}

	const blocks = [body.trimEnd()];
	if (details) blocks.push(details);
	blocks.push(`[View the web page](${siteUrl}${page.path})`);
	return `${blocks.join("\n\n")}\n`;
}
