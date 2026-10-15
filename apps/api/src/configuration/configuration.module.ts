import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConfig } from "../app.config";
import { EntitlementsConfig } from "../entitlements/core/entitlements.config";
import { ResendConfig } from "../../libs/resend/src/resend.config";
import { PostHogConfig } from "../../libs/posthog/src/posthog.config";
import { DatabaseConfig } from "../../libs/db/src/db.config";
import { StorageConfig } from "../../libs/storage/src/storage.config";
import { AuthConfig } from "../../libs/auth/src/auth.config";
import { RedisConfig } from "../../libs/redis/src/redis.config";
import { PolarConfig } from "../../libs/polar/src/polar.config";

const configurations = [
  AppConfig,
  EntitlementsConfig,
  ResendConfig,
  PostHogConfig,
  DatabaseConfig,
  StorageConfig,
  AuthConfig,
  RedisConfig,
  PolarConfig,
];

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: configurations,
  exports: configurations,
})
export class ConfigurationModule {}
