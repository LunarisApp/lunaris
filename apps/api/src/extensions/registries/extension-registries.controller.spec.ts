import { ForbiddenException } from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { describe, expect, it, mock } from "bun:test";
import { ExtensionRegistriesController } from "./extension-registries.controller";

const session = {} as UserSession;

function createController(organizationId = "org-1") {
  const access = {
    requireOrganization: mock(() =>
      Promise.resolve({ organizationId, userId: "user-1" })
    ),
  };
  const registries = {
    requireOwner: mock(() =>
      Promise.reject(new ForbiddenException("Owner required"))
    ),
    setDeveloperMode: mock(),
    add: mock(),
    remove: mock(),
  };
  return {
    controller: new ExtensionRegistriesController(
      access as never,
      registries as never
    ),
    registries,
  };
}

describe("organization marketplace authorization", () => {
  it("rejects non-owners enabling developer mode", async () => {
    const { controller, registries } = createController();
    await expect(
      controller.setDeveloperMode(session, "org-1", { enabled: true })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registries.requireOwner).toHaveBeenCalledWith("org-1", "user-1");
    expect(registries.setDeveloperMode).not.toHaveBeenCalled();
  });

  it("rejects non-owners disabling developer mode", async () => {
    const { controller, registries } = createController();
    await expect(
      controller.setDeveloperMode(session, "org-1", { enabled: false })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registries.setDeveloperMode).not.toHaveBeenCalled();
  });

  it("rejects non-owners adding marketplaces", async () => {
    const { controller, registries } = createController();
    await expect(
      controller.add(session, "org-1", {
        url: "https://example.com/marketplace.json",
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registries.add).not.toHaveBeenCalled();
  });

  it("rejects non-owners removing marketplaces", async () => {
    const { controller, registries } = createController();
    await expect(
      controller.remove(session, {
        organizationId: "org-1",
        registryId: "custom",
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registries.remove).not.toHaveBeenCalled();
  });

  it("rejects requests for a different organization before checking ownership", async () => {
    const { controller, registries } = createController("org-2");
    await expect(
      controller.setDeveloperMode(session, "org-1", { enabled: true })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(registries.requireOwner).not.toHaveBeenCalled();
    expect(registries.setDeveloperMode).not.toHaveBeenCalled();
  });
});
