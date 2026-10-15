import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";

export interface ResendValues {
  apiKey: string;
}

@Injectable()
export class ResendConfig {
  constructor(config: ConfigService) {
    const selfHosted = config.get("DEPLOYMENT_MODE") === "self-hosted";
    const from = config.get<string>("EMAIL_FROM")?.trim();
    const replyTo = config.get<string>("EMAIL_REPLY_TO")?.trim();
    this.from = from || "Lunaris <noreply@mail.lunaris.app>";
    this.replyTo = replyTo || (selfHosted ? undefined : "Lunaris <hello@lunaris.app>");
    this._apiKey = configZ.string().parse((config.get<string>("RESEND_API_KEY") ?? "").trim());
    if (selfHosted && this._apiKey && !from) {
      throw new Error("EMAIL_FROM is required with RESEND_API_KEY for self-hosted email delivery. Use a sender on your verified Resend domain.");
    }
  }

  readonly from: string;
  readonly replyTo: string | undefined;

  private _apiKey: string;

  get values(): ResendValues | undefined {
    if (!this._apiKey) {
      return undefined;
    }
    return {
      apiKey: this._apiKey,
    };
  }
}
