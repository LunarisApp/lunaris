import { Files, FilesError } from "files-sdk";
import { type S3Adapter, s3 } from "files-sdk/s3";

export const releaseTargets = ["macos", "cli"] as const;
export type ReleaseTarget = (typeof releaseTargets)[number];
type ReleaseComponent = "cli" | "desktop";
type SigningMode = "adhoc" | "signed";

interface ReleaseStorageConfig {
	accessKeyId: string;
	bucket: string;
	endpoint?: string;
	region: string;
	secretAccessKey: string;
}

interface ReleaseArtifact {
	format: "dmg" | "zip";
	name: string;
	objectKey: string;
	sha256: string;
	size: number;
	target: "universal-apple-darwin";
}

interface ReleaseManifest {
	artifacts: [ReleaseArtifact];
	component: ReleaseComponent;
	minimumSystemVersion: "13.0";
	schemaVersion: 1;
	signingMode: SigningMode;
	sourceCommit: string;
	tag: string;
	version: string;
}

export interface SignedReleaseDownload {
	component: ReleaseComponent;
	signingMode: SigningMode;
	url: string;
	version: string;
}

export type ReleaseDownloadErrorKind =
	| "configuration"
	| "invalid_manifest"
	| "not_found"
	| "storage";

export class ReleaseDownloadError extends Error {
	readonly kind: ReleaseDownloadErrorKind;

	constructor(
		kind: ReleaseDownloadErrorKind,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "ReleaseDownloadError";
		this.kind = kind;
	}
}

interface ReleaseStorageDependencies {
	getManifest: (key: string) => Promise<string | undefined>;
	signDownload: (input: {
		expiresIn: number;
		key: string;
		name: string;
	}) => Promise<string>;
}

const targetConfig = {
	macos: {
		component: "desktop",
		format: "dmg",
	},
	cli: {
		component: "cli",
		format: "zip",
	},
} as const satisfies Record<
	ReleaseTarget,
	{
		component: ReleaseComponent;
		format: ReleaseArtifact["format"];
	}
>;

const semverPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const releaseObjectPrefix = "releases";

export function isReleaseTarget(value: string): value is ReleaseTarget {
	return releaseTargets.some((target) => target === value);
}

export function isReleaseVersion(value: string): boolean {
	return semverPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireEnvironmentValue(
	environment: Record<string, string | undefined>,
	name: string,
): string {
	const value = environment[name]?.trim();
	if (!value) {
		throw new ReleaseDownloadError(
			"configuration",
			`Required release storage setting is missing: ${name}`,
		);
	}
	return value;
}

export function readReleaseStorageConfig(
	environment: Record<string, string | undefined>,
): ReleaseStorageConfig {
	const endpoint = environment.RELEASES_S3_ENDPOINT?.trim();
	return {
		accessKeyId: requireEnvironmentValue(
			environment,
			"RELEASES_S3_ACCESS_KEY_ID",
		),
		secretAccessKey: requireEnvironmentValue(
			environment,
			"RELEASES_S3_SECRET_ACCESS_KEY",
		),
		region: requireEnvironmentValue(environment, "RELEASES_S3_REGION"),
		bucket: requireEnvironmentValue(environment, "RELEASES_S3_BUCKET"),
		...(endpoint ? { endpoint } : {}),
	};
}

function expectedAssetName(
	component: ReleaseComponent,
	version: string,
	signingMode: SigningMode,
): string {
	const adhocSuffix = signingMode === "adhoc" ? "-adhoc" : "";
	return component === "cli"
		? `lunaris-cli-${version}-universal-apple-darwin${adhocSuffix}.zip`
		: `Lunaris-desktop-${version}-universal${adhocSuffix}.dmg`;
}

function invalidManifest(message: string): never {
	throw new ReleaseDownloadError("invalid_manifest", message);
}

export function parseReleaseManifest(
	source: string,
	target: ReleaseTarget,
): ReleaseManifest {
	let value: unknown;
	try {
		value = JSON.parse(source);
	} catch (error) {
		throw new ReleaseDownloadError(
			"invalid_manifest",
			"Release manifest is not valid JSON",
			{ cause: error },
		);
	}

	if (!isRecord(value)) invalidManifest("Release manifest must be an object");
	const config = targetConfig[target];
	const { component } = config;
	const version = value.version;
	const signingMode = value.signingMode;
	if (value.schemaVersion !== 1) {
		invalidManifest("Unsupported release manifest schema");
	}
	if (value.component !== component) {
		invalidManifest("Release manifest component does not match target");
	}
	if (typeof version !== "string" || !semverPattern.test(version)) {
		invalidManifest("Release manifest version is invalid");
	}
	if (signingMode !== "signed" && signingMode !== "adhoc") {
		invalidManifest("Release manifest signing mode is invalid");
	}
	if (
		(value.tag !== `${component}@${version}` && value.tag !== `v${version}`) ||
		value.minimumSystemVersion !== "13.0" ||
		typeof value.sourceCommit !== "string" ||
		!/^[0-9a-f]{40}$/i.test(value.sourceCommit)
	) {
		invalidManifest("Release manifest metadata is invalid");
	}
	if (!Array.isArray(value.artifacts) || value.artifacts.length !== 1) {
		invalidManifest("Release manifest must contain exactly one artifact");
	}

	const artifact = value.artifacts[0];
	if (!isRecord(artifact)) {
		invalidManifest("Release artifact must be an object");
	}
	const name = expectedAssetName(component, version, signingMode);
	const objectKey = `${releaseObjectPrefix}/${component}/${version}/${name}`;
	if (
		artifact.name !== name ||
		artifact.objectKey !== objectKey ||
		artifact.target !== "universal-apple-darwin" ||
		artifact.format !== config.format ||
		typeof artifact.size !== "number" ||
		!Number.isSafeInteger(artifact.size) ||
		artifact.size <= 0 ||
		typeof artifact.sha256 !== "string" ||
		!/^[0-9a-f]{64}$/i.test(artifact.sha256)
	) {
		invalidManifest("Release artifact metadata is invalid");
	}

	return value as unknown as ReleaseManifest;
}

let cachedFiles: Files<S3Adapter> | undefined;

function defaultDependencies(
	config: ReleaseStorageConfig,
): ReleaseStorageDependencies {
	const files = (cachedFiles ??= new Files({
		adapter: s3({
			bucket: config.bucket,
			region: config.region,
			...(config.endpoint
				? { endpoint: config.endpoint, forcePathStyle: true }
				: {}),
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
		}),
	}));

	return {
		async getManifest(key) {
			try {
				const manifest = await files.download(key);
				return await manifest.text();
			} catch (error) {
				if (error instanceof FilesError && error.code === "NotFound") {
					return undefined;
				}
				throw error;
			}
		},
		signDownload({ expiresIn, key, name }) {
			return files.url(key, {
				expiresIn,
				responseContentDisposition: `attachment; filename="${name}"`,
			});
		},
	};
}

async function resolveManifestDownload(
	target: ReleaseTarget,
	manifestKey: string,
	notFoundMessage: string,
	expected?: {
		filename: string;
		version: string;
	},
	environment: Record<string, string | undefined> = process.env,
	dependencies?: ReleaseStorageDependencies,
): Promise<SignedReleaseDownload> {
	const config = readReleaseStorageConfig(environment);
	const storage = dependencies ?? defaultDependencies(config);
	const component = targetConfig[target].component;

	let manifestSource: string | undefined;
	try {
		manifestSource = await storage.getManifest(manifestKey);
	} catch (error) {
		throw new ReleaseDownloadError(
			"storage",
			"Release manifest could not be read",
			{ cause: error },
		);
	}
	if (manifestSource === undefined) {
		throw new ReleaseDownloadError("not_found", notFoundMessage);
	}

	const manifest = parseReleaseManifest(manifestSource, target);
	if (expected && manifest.version !== expected.version) {
		invalidManifest("Release manifest version does not match request");
	}
	const artifact = manifest.artifacts[0];
	if (expected && artifact.name !== expected.filename) {
		throw new ReleaseDownloadError(
			"not_found",
			"Release artifact was not found",
		);
	}
	let url: string;
	try {
		url = await storage.signDownload({
			key: artifact.objectKey,
			name: artifact.name,
			expiresIn: 300,
		});
	} catch (error) {
		if (error instanceof ReleaseDownloadError) throw error;
		throw new ReleaseDownloadError(
			"storage",
			"Release download URL could not be signed",
			{ cause: error },
		);
	}

	return {
		component,
		version: manifest.version,
		signingMode: manifest.signingMode,
		url,
	};
}

export function resolveReleaseDownload(
	target: ReleaseTarget,
	environment: Record<string, string | undefined> = process.env,
	dependencies?: ReleaseStorageDependencies,
): Promise<SignedReleaseDownload> {
	const _config = readReleaseStorageConfig(environment);
	const component = targetConfig[target].component;
	return resolveManifestDownload(
		target,
		`${releaseObjectPrefix}/${component}/latest.json`,
		`Latest ${component} release was not found`,
		undefined,
		environment,
		dependencies,
	);
}

export function resolveVersionedReleaseDownload(
	target: ReleaseTarget,
	version: string,
	filename: string,
	environment: Record<string, string | undefined> = process.env,
	dependencies?: ReleaseStorageDependencies,
): Promise<SignedReleaseDownload> {
	if (!isReleaseVersion(version) || !filename) {
		return Promise.reject(
			new ReleaseDownloadError("not_found", "Release artifact was not found"),
		);
	}

	const _config = readReleaseStorageConfig(environment);
	const component = targetConfig[target].component;
	return resolveManifestDownload(
		target,
		`${releaseObjectPrefix}/${component}/${version}/release.json`,
		`${component} ${version} release was not found`,
		{ filename, version },
		environment,
		dependencies,
	);
}
