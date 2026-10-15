import { Global, Module } from "@nestjs/common";
import { Resend } from "resend";
import { ResendConfig } from "./resend.config";

export const RESEND_CLIENT = "RESEND_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: RESEND_CLIENT,
      inject: [ResendConfig],
      useFactory: (config: ResendConfig): Resend | null => {
        const values = config.values;
        if (!values) return null;
        return new Resend(values.apiKey);
      },
    },
  ],
  exports: [RESEND_CLIENT],
})
export class ResendModule {}
