import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";

@Injectable()
export class PostHogConfig {
  constructor(config: ConfigService) {
    this._key = configZ.string().parse(config.get("POSTHOG_API_KEY") ?? "");
    this.apiHost = configZ
      .string()
      .parse(config.get("POSTHOG_HOST") ?? "https://us.i.posthog.com");
  }

  private _key: string;

  apiHost: string;

  get key(): string | undefined {
    return this._key || undefined;
  }
}
