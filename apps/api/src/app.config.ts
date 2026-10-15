import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { array, string } from "zod";

const desktopOriginsSchema = string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(array(string().url()).min(1));

@Injectable()
export class AppConfig {
  constructor(config: ConfigService) {
    this.appRegion = string().min(1).parse(config.get("APP_REGION"));
    this.desktopAppOrigins = desktopOriginsSchema.parse(
      config.get("DESKTOP_APP_ORIGINS") ??
        "lunaris://,tauri://localhost,http://tauri.localhost",
    );
    this.frontendUrl = string().url().parse(config.get("FRONTEND_URL"));
    this.localDbEncryptionMasterKey = string()
      .regex(/^[0-9a-f]{64}$/i)
      .parse(config.get("LOCAL_DB_ENCRYPTION_MASTER_KEY"));
    this.nodeEnv = string()
      .default("development")
      .parse(config.get("NODE_ENV"));
    this.powersyncUrl = string().url().parse(config.get("POWERSYNC_URL"));
    this.url = string().url().parse(config.get("URL"));
  }

  appRegion: string;

  desktopAppOrigins: string[];

  frontendUrl: string;

  localDbEncryptionMasterKey: string;

  nodeEnv: string;

  powersyncUrl: string;

  url: string;
}
