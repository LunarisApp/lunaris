import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";
import { TypeOf, enum as zEnum } from "zod";

export const sslSchema = zEnum(["true", "false"])
  .transform((v) => v === "true")
  .prefault("true");
export type SSLSchema = TypeOf<typeof sslSchema>;

@Injectable()
export class DatabaseConfig {
  constructor(config: ConfigService) {
    this.host = configZ.string().parse(config.get("DATABASE_HOST"));
    this.port = configZ.coerce.number().parse(config.get("DATABASE_PORT"));
    this.user = configZ.string().parse(config.get("DATABASE_USER"));
    this.password = configZ.string().parse(config.get("DATABASE_PASSWORD"));
    this.name = configZ.string().parse(config.get("DATABASE_NAME"));
    this.ssl = sslSchema.parse(config.get("DATABASE_SSL"));
  }

  host: string;

  port: number;

  user: string;

  password: string;

  name: string;

  ssl: SSLSchema;
}
