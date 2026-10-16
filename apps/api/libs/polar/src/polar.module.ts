import { Global, Module } from "@nestjs/common";
import { Polar } from "@polar-sh/sdk";
import { PolarConfig } from "./polar.config";

export const POLAR_CLIENT = "POLAR_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: POLAR_CLIENT,
      inject: [PolarConfig],
      useFactory: (config: PolarConfig): Polar | null => {
        if (!config.enabled) {
          return null;
        }
        const values = config.values;
        if (!values) {
          return null;
        }
        return new Polar({
          accessToken: values.accessToken,
          server: values.sandbox ? "sandbox" : "production",
          // Billing calls can hold database locks. Bound each request and let
          // reconciliation retry failures on its next run instead of under lock.
          timeoutMs: 10_000,
          retryConfig: { strategy: "none" },
        });
      },
    },
  ],
  exports: [POLAR_CLIENT],
})
export class PolarModule {}
