import { Files, FilesError } from "files-sdk";
import { type S3Adapter, s3 } from "files-sdk/s3";
import type {
	ReleaseStorageConfig,
	ReleaseStorageDependencies,
} from "./release-downloads";

let cachedFiles: Files<S3Adapter> | undefined;

export function createReleaseStorage(
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
