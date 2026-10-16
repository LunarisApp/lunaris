import { RESEND_CLIENT } from "@app/resend";
import { Inject, Injectable } from "@nestjs/common";
import { useLogger } from "evlog/nestjs";
import type { Resend } from "resend";

@Injectable()
export class AccountDeletionService {
  constructor(@Inject(RESEND_CLIENT) private readonly resend: Resend | null) {}

  async requestDeletion(user: { id: string; name: string; email: string }) {
    const log = useLogger();
    log.set({
      deletionRequest: {
        notificationStatus: "pending",
        resource: "account",
      },
      user: { id: user.id },
    });
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    });

    if (!this.resend) {
      log.warn("Account deletion request email skipped", {
        deletionRequest: {
          notificationStatus: "skipped",
          reason: "resend-not-configured",
        },
      });
      return { success: true };
    }

    await this.resend.emails.send({
      from: "Lunaris <noreply@mail.lunaris.app>",
      replyTo: user.email,
      to: "hello@lunaris.app",
      subject: `Account Deletion Request — ${user.email}`,
      html: `<p>Account deletion request received.</p>
<ul>
<li><strong>Name:</strong> ${user.name}</li>
<li><strong>Email:</strong> ${user.email}</li>
<li><strong>User ID:</strong> ${user.id}</li>
<li><strong>Requested at:</strong> ${timestamp}</li>
</ul>`,
    });
    log.set({
      deletionRequest: { notificationStatus: "sent" },
    });

    return { success: true };
  }
}
