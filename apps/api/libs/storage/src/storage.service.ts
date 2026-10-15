import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, HeadBucketCommand, HeadObjectCommand, ListMultipartUploadsCommand, ListPartsCommand, UploadPartCommand, type Part, type S3Client } from "@aws-sdk/client-s3";
import {
	Injectable,
	InternalServerErrorException,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { log } from "evlog";
import { Files, type StoredFile, type UploadProgress } from "files-sdk";
import { type S3Adapter, s3 } from "files-sdk/s3";
import { StorageConfig } from "./storage.config";

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
	private readonly files: Files<S3Adapter>;
	private readonly client: S3Client;
  private readonly signingFiles: Files<S3Adapter>;
	readonly bucket: string;

	constructor(config: StorageConfig) {
		this.bucket = config.bucket;
		this.files = new Files({
			adapter: s3({
				bucket: config.bucket,
				endpoint: config.endpoint,
				region: config.region,
				credentials: {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey,
				},
				forcePathStyle: true,
			}),
		});
    this.signingFiles = !config.publicEndpoint || config.publicEndpoint === config.endpoint ? this.files : new Files({ adapter: s3({
      bucket: config.bucket,
      endpoint: config.publicEndpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
    }) });
    this.signingFiles.raw.config.requestChecksumCalculation = async () => "WHEN_REQUIRED";
		this.client = this.files.raw;
    // UploadPart presigning has no body. Optional automatic CRC32 would sign the
    // empty-body checksum and reject every nonempty browser part.
    this.client.config.requestChecksumCalculation = async () => "WHEN_REQUIRED";
		log.info({
			context: StorageService.name,
			message: "Storage client initialized",
			storage: { bucket: this.bucket, endpoint: config.endpoint },
		});
	}

	async onModuleInit() {
		await this.verifyBucket();
		log.info({
			context: StorageService.name,
			message: "Storage bucket verified",
			storage: { bucket: this.bucket },
		});
	}

	async onModuleDestroy() {
		this.client.destroy();
    if (this.signingFiles !== this.files) this.signingFiles.raw.destroy();
		log.info({
			context: StorageService.name,
			message: "Storage client destroyed",
			storage: { bucket: this.bucket },
		});
	}

	async putObject(
		key: string,
		body: Buffer | Uint8Array | string,
		contentType?: string,
	) {
		return this.files.upload(key, body, { contentType });
	}

	async putObjectStream(
		key: string,
		body: ReadableStream<Uint8Array>,
		options: {
			contentType?: string;
			onProgress?: (progress: UploadProgress) => void;
			signal?: AbortSignal;
		} = {},
	) {
		return this.files.upload(key, body, {
			contentType: options.contentType,
			multipart: true,
			onProgress: options.onProgress,
			signal: options.signal,
		});
	}

	async getObject(key: string) {
		return this.files.download(key);
	}

	async getObjectStream(key: string) {
		const file = await this.files.download(key, { as: "stream", timeout: 0 });
		return file.stream();
	}

	async *listObjects(prefix: string): AsyncGenerator<StoredFile> {
		for await (const file of this.files.listAll({ prefix, limit: 500 })) {
			yield file;
		}
	}

	async deleteObject(key: string) {
		return this.files.delete(key);
	}

  async createMultipart(key: string, contentType: string) {
    const result = await this.client.send(new CreateMultipartUploadCommand({
      Bucket: this.bucket, Key: key, ContentType: contentType,
    }));
    if (!result.UploadId) throw new Error("Storage returned no multipart upload ID");
    return result.UploadId;
  }

  async signPart(key: string, uploadId: string, partNumber: number, size: number) {
    return getSignedUrl(this.signingFiles.raw, new UploadPartCommand({
      Bucket: this.bucket, Key: key, UploadId: uploadId,
      PartNumber: partNumber, ContentLength: size,
    }), { expiresIn: 600, signableHeaders: new Set(["content-length"]) });
  }

  async listParts(key: string, uploadId: string) {
    const parts: Part[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(new ListPartsCommand({
        Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker,
      }));
      parts.push(...(page.Parts ?? []));
      if (!page.IsTruncated) break;
      if (!page.NextPartNumberMarker || page.NextPartNumberMarker === marker) {
        throw new Error("Storage returned invalid multipart pagination");
      }
      marker = page.NextPartNumberMarker;
    } while (true);
    return parts;
  }

  async completeMultipart(key: string, uploadId: string, parts: Part[]) {
    await this.client.send(new CompleteMultipartUploadCommand({
      Bucket: this.bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })) },
    }));
  }

  async abortMultipart(key: string, uploadId: string) {
    try {
      await this.client.send(new AbortMultipartUploadCommand({
        Bucket: this.bucket, Key: key, UploadId: uploadId,
      }));
    } catch (error) {
      if (!(error instanceof Error && error.name === "NoSuchUpload")) throw error;
    }
  }

  async abortMultipartForKey(key: string) {
    let keyMarker: string | undefined;
    let uploadMarker: string | undefined;
    do {
      const page = await this.client.send(new ListMultipartUploadsCommand({
        Bucket: this.bucket, Prefix: key, KeyMarker: keyMarker, UploadIdMarker: uploadMarker,
      }));
      for (const upload of page.Uploads ?? []) {
        if (upload.Key === key && upload.UploadId) await this.abortMultipart(key, upload.UploadId);
      }
      if (!page.IsTruncated) return;
      if (!page.NextKeyMarker || (keyMarker === page.NextKeyMarker && uploadMarker === page.NextUploadIdMarker)) {
        throw new Error("Storage returned invalid upload pagination");
      }
      keyMarker = page.NextKeyMarker;
      uploadMarker = page.NextUploadIdMarker;
    } while (true);
  }

  async objectSize(key: string): Promise<number | null> {
    try {
      const object = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (object.ContentLength == null || !Number.isSafeInteger(object.ContentLength)) {
        throw new Error("Storage returned invalid object size");
      }
      return object.ContentLength;
    } catch (error) {
      if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) return null;
      throw error;
    }
  }

	async verifyBucket() {
		await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
	}

	async getSignedDownloadUrl(
		key: string,
		expiresIn = 3600,
		responseContentDisposition?: string,
	) {
		return this.signingFiles.url(
			key,
			responseContentDisposition
				? { expiresIn, responseContentDisposition }
				: { expiresIn },
		);
	}

	async getSignedUploadUrl(
		key: string,
		contentType?: string,
		expiresIn = 3600,
	) {
		const signedUpload = await this.signingFiles.signedUploadUrl(key, {
			contentType,
			expiresIn,
		});
		if (signedUpload.method !== "PUT") {
			throw new InternalServerErrorException(
				"Storage adapter returned unsupported signed upload method",
			);
		}
		return signedUpload.url;
	}
}
