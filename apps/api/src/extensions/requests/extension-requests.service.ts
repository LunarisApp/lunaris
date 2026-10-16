import { RESEND_CLIENT } from "@app/resend";
import { ServiceError } from "@app/utils/errors";
import { Inject, Injectable } from "@nestjs/common";
import { useLogger } from "evlog/nestjs";
import type { Resend } from "resend";

interface ExtensionRequest {
  idea: string;
  user: {
    email: string;
    id: string;
    name: string;
  };
}

@Injectable()
export class ExtensionRequestsService {
  constructor(@Inject(RESEND_CLIENT) private readonly resend: Resend | null) {}

  async submit(request: ExtensionRequest): Promise<{ success: true }> {
    const log = useLogger();
    log.set({
      extensionRequest: {
        notificationStatus: "pending",
      },
      user: { id: request.user.id },
    });

    if (!this.resend) {
      log.set({
        extensionRequest: { notificationStatus: "configuration_error" },
      });
      throw new ServiceError({
        fix: "Set RESEND_API_KEY for the API service",
        message: "Extension request email is not configured",
        reason: "service.unavailable",
        why: "Resend client is unavailable",
      });
    }

    const text = [
      "Extension idea received.",
      "",
      "Idea:",
      request.idea,
      "",
      `Account name: ${request.user.name}`,
      `Account email: ${request.user.email}`,
      `User ID: ${request.user.id}`,
      `Requested at: ${new Date().toISOString()}`,
    ].join("\n");

    let providerError: unknown;
    try {
      const result = await this.resend.emails.send({
        from: "Lunaris <noreply@mail.lunaris.app>",
        replyTo: request.user.email,
        subject: "New Lunaris extension idea",
        text,
        to: "hello@lunaris.app",
      });
      providerError = result.error;
    } catch (error) {
      providerError = error;
    }

    if (providerError) {
      log.set({
        extensionRequest: { notificationStatus: "provider_error" },
      });
      throw new ServiceError({
        ...(providerError instanceof Error
          ? { cause: providerError }
          : {
              internal: {
                providerErrorName: readProviderErrorName(providerError),
              },
            }),
        fix: "Inspect Resend delivery status and API email configuration",
        message: "Extension request email delivery failed",
        reason: "service.unavailable",
        why: "Resend did not accept the email",
      });
    }

    log.set({
      extensionRequest: { notificationStatus: "sent" },
    });
    return { success: true };
  }
}

function readProviderErrorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name;
  }
  return "unknown";
}
