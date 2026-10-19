import { expect, test } from "bun:test";
import { installerUrl, latestInstallerUrl } from "./self-host-installer";

const release = (tag_name: string, extra: Record<string, unknown> = {}) => ({
	tag_name,
	draft: false,
	prerelease: false,
	assets: [{ name: "install.sh" }],
	...extra,
});

test("latest installer skips unrelated, draft, prerelease, and incomplete releases", async () => {
	expect(
		await latestInstallerUrl(async () => [
			release("web@9.0.0"),
			release("self-hosted@3.0.0", { draft: true }),
			release("self-hosted@2.0.0", { prerelease: true }),
			release("self-hosted@1.3.0", { assets: [] }),
			release("self-hosted@1.2.3"),
		]),
	).toBe(installerUrl("1.2.3"));
});

test("finds self-hosted release beyond first GitHub page", async () => {
	const pages: number[] = [];
	const url = await latestInstallerUrl(async (page) => {
		pages.push(page);
		return page === 1
			? Array.from({ length: 100 }, () => release("cli@1.0.0"))
			: [release("self-hosted@1.0.0")];
	});
	expect(url).toBe(installerUrl("1.0.0"));
	expect(pages).toEqual([1, 2]);
});

test("latest installer compares versions across pages instead of release order", async () => {
	const url = await latestInstallerUrl(async (page) =>
		page === 1
			? [
					release("self-hosted@1.10.2"),
					release("self-hosted@1.9.9"),
					...Array.from({ length: 98 }, () => release("web@1.0.0")),
				]
			: [release("self-hosted@2.0.0"), release("self-hosted@1.11.0")],
	);
	expect(url).toBe(installerUrl("2.0.0"));
	expect(
		await latestInstallerUrl(async () => [
			release("self-hosted@1.9.9"),
			release("self-hosted@1.10.2"),
		]),
	).toBe(installerUrl("1.10.2"));
});

test("missing or invalid release data never redirects to executable content", async () => {
	await expect(latestInstallerUrl(async () => [])).rejects.toThrow(
		"No published",
	);
	await expect(
		latestInstallerUrl(async () => ({ message: "rate limited" })),
	).rejects.toThrow("Invalid GitHub");
	expect(() => installerUrl("1.0.0/../../main")).toThrow();
});
