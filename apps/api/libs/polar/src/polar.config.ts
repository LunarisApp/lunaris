import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";
import { TypeOf, enum as zEnum } from "zod";

const booleanSchema = zEnum(["true", "false"]).transform((v) => v !== "false");
type BooleanValue = TypeOf<typeof booleanSchema>;

export interface PolarValues {
  accessToken: string;
  productIds: {
    businessMonthly: string;
    businessYearly: string;
    plusMonthly: string;
    plusYearly: string;
  };
  sandbox: boolean;
  webhookSecret: string;
}

@Injectable()
export class PolarConfig {
  constructor(config: ConfigService) {
    this._nodeEnv = configZ
      .string()
      .parse(config.get("NODE_ENV") ?? "development");
    this._accessToken = configZ
      .string()
      .parse(config.get("POLAR_ACCESS_TOKEN") ?? "");
    this._webhookSecret = configZ
      .string()
      .nullable()
      .parse(config.get("POLAR_WEBHOOK_SECRET") ?? null);
    this._sandbox = booleanSchema.parse(config.get("POLAR_SANDBOX") ?? "true");
    this._plusMonthlyProductId = configZ
      .string()
      .parse(config.get("POLAR_PLUS_MONTHLY_PRODUCT_ID") ?? "");
    this._plusYearlyProductId = configZ
      .string()
      .parse(config.get("POLAR_PLUS_YEARLY_PRODUCT_ID") ?? "");
    this._businessMonthlyProductId = configZ
      .string()
      .parse(config.get("POLAR_BUSINESS_MONTHLY_PRODUCT_ID") ?? "");
    this._businessYearlyProductId = configZ
      .string()
      .parse(config.get("POLAR_BUSINESS_YEARLY_PRODUCT_ID") ?? "");
    this.disabled = booleanSchema.parse(
      config.get("POLAR_DISABLED") ?? "false",
    );
  }

  private _nodeEnv: string;

  private _accessToken: string;

  private _webhookSecret: string | null;

  private _sandbox: BooleanValue;

  private _plusMonthlyProductId: string;

  private _plusYearlyProductId: string;

  private _businessMonthlyProductId: string;

  private _businessYearlyProductId: string;

  disabled: BooleanValue;

  private get configured(): boolean {
    return Boolean(
      this._accessToken &&
        this._webhookSecret &&
        this._plusMonthlyProductId &&
        this._plusYearlyProductId &&
        this._businessMonthlyProductId &&
        this._businessYearlyProductId,
    );
  }

  /** Single runtime rule used by SDK, auth routes, and entitlement metadata. */
  get enabled(): boolean {
    const disabledOutsideProduction =
      this._nodeEnv !== "production" && this.disabled;
    return this.configured && !disabledOutsideProduction;
  }

  get values(): PolarValues | undefined {
    if (!this.configured) return undefined;
    return {
      accessToken: this._accessToken,
      productIds: {
        businessMonthly: this._businessMonthlyProductId,
        businessYearly: this._businessYearlyProductId,
        plusMonthly: this._plusMonthlyProductId,
        plusYearly: this._plusYearlyProductId,
      },
      webhookSecret: this._webhookSecret!,
      sandbox: this._sandbox,
    };
  }
}
