import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";

@Injectable()
export class StorageConfig {
  constructor(config: ConfigService) {
    this.endpoint = configZ.string().parse(config.get("AWS_ENDPOINT_URL"));
    this.publicEndpoint = configZ.string().url().parse(config.get("AWS_PUBLIC_ENDPOINT_URL") ?? this.endpoint);
    this.region = configZ.string().parse(config.get("AWS_DEFAULT_REGION"));
    this.bucket = configZ.string().parse(config.get("AWS_S3_BUCKET"));
    this.accessKeyId = configZ.string().parse(config.get("AWS_ACCESS_KEY_ID"));
    this.secretAccessKey = configZ
      .string()
      .parse(config.get("AWS_SECRET_ACCESS_KEY"));
  }

  endpoint: string;

  publicEndpoint: string;

  region: string;

  bucket: string;

  accessKeyId: string;

  secretAccessKey: string;
}
