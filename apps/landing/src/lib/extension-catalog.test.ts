import { describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { extensionCatalog } from "@/data/extension-catalog";
import { extensionsCopy } from "@/data/extensions";
import { locales } from "@/i18n/config";
import { filterExtensions } from "./extension-catalog";

const slugs = (query: string, filter: "all" | "catalog" | "built-in" = "all") =>
	filterExtensions(extensionCatalog, query, filter, extensionsCopy.en).map(
		(extension) => extension.slug,
	);

describe("extension discovery", () => {
	test("finds publisher keywords beyond the display name", () => {
		expect(slugs("CSV")).toEqual(["spreadsheet"]);
		expect(slugs("whiteboard")).toEqual(["excalidraw"]);
	});

	test("matches multiple words across name and keywords", () => {
		expect(slugs("spreadsheet formulas")).toEqual(["spreadsheet"]);
		expect(slugs("spreadsheet drawing")).toEqual([]);
	});

	test("searches localized descriptions without requiring accents", () => {
		const results = filterExtensions(
			extensionCatalog,
			"formules",
			"all",
			extensionsCopy.fr,
		);
		expect(results.map((entry) => entry.slug)).toEqual(["spreadsheet"]);
		const accented = filterExtensions(
			extensionCatalog,
			"decisions",
			"all",
			extensionsCopy.fr,
		);
		expect(accented.map((entry) => entry.slug)).toEqual(["rich-text"]);
	});

	test("combines origin filters with search and accepts whitespace", () => {
		expect(slugs("  ").length).toBe(extensionCatalog.length);
		expect(slugs("", "built-in")).toEqual(["file", "kanban", "rich-text"]);
		expect(slugs("kanban", "catalog")).toEqual([]);
		expect(slugs("pdf", "catalog")).toEqual(["exporter"]);
	});
});

describe("extension catalog integrity", () => {
	test("has unique route slugs and publisher IDs", () => {
		expect(new Set(extensionCatalog.map((entry) => entry.slug)).size).toBe(
			extensionCatalog.length,
		);
		expect(new Set(extensionCatalog.map((entry) => entry.id)).size).toBe(
			extensionCatalog.length,
		);
		for (const entry of extensionCatalog)
			expect(entry.slug).toMatch(/^[a-z0-9-]+$/);
	});

	test("every icon, screenshot, and localized permission label exists", async () => {
		const publicRoot = new URL("../../public/", import.meta.url);
		for (const entry of extensionCatalog) {
			await access(new URL(`img/extensions/${entry.slug}.webp`, publicRoot));
			for (const screenshot of entry.screenshots)
				await access(new URL(screenshot.src.slice(1), publicRoot));
			for (const locale of locales) {
				for (const permission of entry.permissions)
					expect(extensionsCopy[locale].permissions[permission]).toBeTruthy();
			}
		}
	});
});
