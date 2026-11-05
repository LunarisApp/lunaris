import { Global, Module } from "@nestjs/common";
import { createPolar, type Polar } from "@polar-sh/sdk/2026-10";
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
        return createPolar({
          accessToken: values.accessToken,
          environment: values.sandbox ? "sandbox" : "production",
          // Billing calls can hold database locks. Bound each request and let
          // reconciliation retry failures on its next run instead of under lock.
          timeout: 10,
        });
      },
    },
  ],
  exports: [POLAR_CLIENT],
})
export class PolarModule {}
