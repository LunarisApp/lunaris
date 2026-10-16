import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z as configZ } from "zod";
import { PLAN, type PlanSlug } from "@repo/auth/entitlements";
import { z } from "zod";

const developmentPlanSchema = z
  .union([
    z.literal(""),
    z.enum([PLAN.free, PLAN.plus, PLAN.business, PLAN.enterprise]),
  ])
  .transform((value): PlanSlug | null => value || null);

@Injectable()
export class EntitlementsConfig {
  constructor(config: ConfigService) {
    this.selfHosted = config.get("DEPLOYMENT_MODE") === "self-hosted";
    this.selfHostedPlan = developmentPlanSchema.parse(
      config.get("SELF_HOSTED_PLAN") ?? "enterprise"
    );
    this.nodeEnv = configZ
      .string()
      .parse(config.get("NODE_ENV") ?? "development");
    this.configuredDevelopmentPlan = developmentPlanSchema.parse(
      config.get("DEV_ENTITLEMENT_PLAN") ?? ""
    );
  }

  private selfHosted: boolean;

  private selfHostedPlan: PlanSlug | null;

  private nodeEnv: string;

  private configuredDevelopmentPlan: PlanSlug | null;

  get developmentPlan(): PlanSlug | null {
    if (this.selfHosted) {
      return this.selfHostedPlan;
    }
    if (this.nodeEnv === "production") {
      return null;
    }
    return this.configuredDevelopmentPlan;
  }
}
