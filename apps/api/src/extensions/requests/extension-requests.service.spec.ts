import { describe, expect, it, mock } from "bun:test";
import { ExtensionRequestsService } from "./extension-requests.service";

const request = {
  idea: "A diagram extension with Mermaid import",
  user: {
    email: "account@example.com",
    id: "user_1",
    name: "Ada Lovelace",
  },
};

describe("ExtensionRequestsService", () => {
  it("forwards an extension idea with the session email", async () => {
    const send = mock(() =>
      Promise.resolve({ data: { id: "email_1" }, error: null })
    );
    const service = new ExtensionRequestsService({
      emails: { send },
    } as never);

    await expect(service.submit(request)).resolves.toEqual({ success: true });
    expect(send).toHaveBeenCalledWith({
      from: "Lunaris <noreply@mail.lunaris.app>",
      replyTo: "account@example.com",
      subject: "New Lunaris extension idea",
      text: expect.stringContaining(
        "Idea:\nA diagram extension with Mermaid import"
      ),
      to: "hello@lunaris.app",
    });
  });

  it("fails when email delivery is not configured", async () => {
    const service = new ExtensionRequestsService(null);

    await expect(service.submit(request)).rejects.toMatchObject({
      reason: "service.unavailable",
    });
  });

  it("fails when Resend rejects the email", async () => {
    const service = new ExtensionRequestsService({
      emails: {
        send: () =>
          Promise.resolve({
            data: null,
            error: { message: "Rejected", name: "validation_error" },
          }),
      },
    } as never);

    await expect(service.submit(request)).rejects.toMatchObject({
      reason: "service.unavailable",
    });
  });
});
