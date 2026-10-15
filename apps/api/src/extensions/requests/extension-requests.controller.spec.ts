import { describe, expect, it, mock } from "bun:test";
import { ExtensionRequestsController } from "./extension-requests.controller";

describe("ExtensionRequestsController", () => {
  it("attaches the anonymous session identity instead of client email", async () => {
    const submit = mock(() => Promise.resolve({ success: true as const }));
    const controller = new ExtensionRequestsController({ submit } as never);

    await controller.submit(
      {
        user: {
          email: "guest@anon.lunaris.app",
          id: "anon_1",
          name: "Anonymous",
        },
      } as never,
      {
        email: "spoofed@example.com",
        idea: "Add a diagram extension",
      } as never
    );

    expect(submit).toHaveBeenCalledWith({
      idea: "Add a diagram extension",
      user: {
        email: "guest@anon.lunaris.app",
        id: "anon_1",
        name: "Anonymous",
      },
    });
  });
});
