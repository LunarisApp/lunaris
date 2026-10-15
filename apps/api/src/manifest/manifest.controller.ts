import { ResendConfig } from "@app/resend";
import { StorageConfig } from "@app/storage";
import { AuthConfig } from "../../libs/auth/src/auth.config";
import { RetrieveApi } from "@app/utils/openapi";
import { Controller, Header } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { AppConfig } from "../app.config";
import { ManifestResponseDto } from "./manifest.schema";
import { buildManifest } from "./manifest.utils";

@AllowAnonymous()
@Controller("manifest")
export class ManifestController {
  constructor(
    private readonly appConfig: AppConfig,
    private readonly storageConfig: StorageConfig,
    private readonly authConfig: AuthConfig,
    private readonly resendConfig: ResendConfig,
  ) {}

  @Header("Cache-Control", "private, no-store")
  @RetrieveApi({
    serializer: ManifestResponseDto,
    operation: {
      summary: "Get public client manifest",
      description:
        "Returns region-scoped runtime configuration used by the web client.",
    },
  })
  getManifest(): ManifestResponseDto {
    return buildManifest({
      appRegion: this.appConfig.appRegion,
      apiUrl: this.appConfig.url,
      syncUrl: this.appConfig.powersyncUrl,
      storageUrl: this.storageConfig.publicEndpoint,
      signupsAllowed: this.authConfig.signupsAllowed,
      passwordResetEmail: Boolean(this.resendConfig.values),
      socialProviders: this.authConfig.socialProviders,
    });
  }
}
