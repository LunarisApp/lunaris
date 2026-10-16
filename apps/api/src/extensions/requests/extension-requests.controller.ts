import { ActionApi } from "@app/utils/openapi";
import { Body, Controller } from "@nestjs/common";
import { seconds, Throttle } from "@nestjs/throttler";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  ExtensionRequestDto,
  ExtensionRequestResponseDto,
} from "./extension-requests.schema";
import { ExtensionRequestsService } from "./extension-requests.service";

@Controller("extension-requests")
export class ExtensionRequestsController {
  constructor(private readonly extensionRequests: ExtensionRequestsService) {}

  @ActionApi({
    serializer: ExtensionRequestResponseDto,
    operation: { summary: "Submit an extension idea" },
  })

  @Throttle({ default: { limit: 5, ttl: seconds(60) } })
  submit(
    @Session() session: UserSession,
    @Body({ schema: ExtensionRequestDto }) body: ExtensionRequestDto
  ): Promise<ExtensionRequestResponseDto> {
    return this.extensionRequests.submit({
      idea: body.idea,
      user: {
        email: session.user.email,
        id: session.user.id,
        name: session.user.name,
      },
    });
  }
}
