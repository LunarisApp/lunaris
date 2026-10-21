export type ExtensionPermission =
	| "content.read"
	| "content.write"
	| "files.read"
	| "files.write"
	| "downloads.write"
	| "network.https";

export type ExtensionScreenshot = {
	src: string;
	width: number;
	height: number;
	alt: string;
};

export type CatalogExtension = {
	slug: string;
	id: string;
	name: string;
	builtIn: boolean;
	developer: string;
	version: string;
	api: string;
	description: string;
	longDescription?: string;
	keywords: readonly string[];
	permissions: readonly ExtensionPermission[];
	repository: string;
	website?: string;
	screenshots: readonly ExtensionScreenshot[];
};
