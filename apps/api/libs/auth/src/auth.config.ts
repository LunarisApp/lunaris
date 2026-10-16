import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { string, TypeOf, enum as zEnum } from "zod";

const optionalString = string().trim().optional();
const booleanString = zEnum(["true", "false"]).transform((v) => v === "true");
type BooleanString = TypeOf<typeof booleanString>;

@Injectable()
export class AuthConfig {
  constructor(config: ConfigService) {
    this._googleClientId = optionalString.parse(config.get("GOOGLE_CLIENT_ID"));
    this._googleClientSecret = optionalString.parse(
      config.get("GOOGLE_CLIENT_SECRET")
    );
    this.signupsAllowed = booleanString.parse(
      config.get("SIGNUPS_ALLOWED") ?? "true"
    );
    this.selfHosted = config.get("DEPLOYMENT_MODE") === "self-hosted";
    this.emailVerificationDisabled = booleanString.parse(
      config.get("EMAIL_VERIFICATION_DISABLED") ?? "false"
    );
  }

  private _googleClientId?: string;

  private _googleClientSecret?: string;

  emailVerificationDisabled: BooleanString;

  selfHosted: boolean;

  signupsAllowed: boolean;

  get socialProviders(): "google"[] {
    return this.values?.google ? ["google"] : [];
  }

  get values() {
    if (!(this._googleClientId && this._googleClientSecret)) {
      return undefined;
    }

    return {
      google: {
        clientId: this._googleClientId,
        clientSecret: this._googleClientSecret,
      },
    };
  }
}
