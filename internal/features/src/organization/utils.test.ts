import { describe, expect, it } from "vitest";
import { resolveOrganizationSettingsTab } from "./utils";

describe("resolveOrganizationSettingsTab", () => {
  it("allows teams only for collaborative organizations with read access", () => {
    const base = {
      canReadAudit: false,
      canReadBackups: false,
      canReadBilling: false,
      canReadMembers: true,
      canReadTeams: true,
      isAnonymous: false,
      isOwner: false,
      requestedTab: "teams",
    };

    expect(resolveOrganizationSettingsTab({ ...base, isPersonal: false })).toBe(
      "teams"
    );
    expect(resolveOrganizationSettingsTab({ ...base, isPersonal: true })).toBe(
      "general"
    );
    expect(
      resolveOrganizationSettingsTab({
        ...base,
        canReadTeams: false,
        isPersonal: false,
      })
    ).toBe("general");
  });

  it("allows backups only for owners, including personal organizations", () => {
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: true,
        canReadBackups: true,
        canReadBilling: true,
        canReadMembers: true,
        canReadTeams: true,
        isAnonymous: false,
        isOwner: true,
        isPersonal: true,
        requestedTab: "backups",
      })
    ).toBe("backups");
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: true,
        canReadBackups: true,
        canReadBilling: true,
        canReadMembers: true,
        canReadTeams: true,
        isAnonymous: false,
        isOwner: false,
        isPersonal: false,
        requestedTab: "backups",
      })
    ).toBe("general");
  });

  it("hides members for personal organizations", () => {
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: true,
        canReadBackups: true,
        canReadBilling: true,
        canReadMembers: true,
        canReadTeams: true,
        isAnonymous: false,
        isOwner: true,
        isPersonal: true,
        requestedTab: "members",
      })
    ).toBe("general");
  });

  it("allows billing for signed-in members but not anonymous users", () => {
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: true,
        canReadBackups: true,
        canReadBilling: true,
        canReadMembers: true,
        canReadTeams: true,
        isAnonymous: false,
        isOwner: false,
        isPersonal: false,
        requestedTab: "billing",
      })
    ).toBe("billing");
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: true,
        canReadBackups: true,
        canReadBilling: true,
        canReadMembers: true,
        canReadTeams: true,
        isAnonymous: true,
        isOwner: true,
        isPersonal: true,
        requestedTab: "billing",
      })
    ).toBe("general");
  });

  it("rejects tabs without matching read permission", () => {
    const base = {
      canReadAudit: false,
      canReadBackups: false,
      canReadBilling: false,
      canReadMembers: false,
      canReadTeams: false,
      isAnonymous: false,
      isOwner: true,
      isPersonal: false,
    };

    expect(
      resolveOrganizationSettingsTab({ ...base, requestedTab: "members" })
    ).toBe("general");
    expect(
      resolveOrganizationSettingsTab({ ...base, requestedTab: "billing" })
    ).toBe("general");
    expect(
      resolveOrganizationSettingsTab({ ...base, requestedTab: "backups" })
    ).toBe("general");
  });

  it("rejects the removed extensions tab", () => {
    expect(
      resolveOrganizationSettingsTab({
        canReadAudit: false,
        canReadBackups: false,
        canReadBilling: false,
        canReadMembers: false,
        canReadTeams: false,
        isAnonymous: false,
        isOwner: false,
        isPersonal: false,
        requestedTab: "extensions",
      })
    ).toBe("general");
  });

  it("allows audit for signed-in owners with permission", () => {
    const base = {
      canReadAudit: true,
      canReadBackups: false,
      canReadBilling: false,
      canReadMembers: false,
      canReadTeams: false,
      isOwner: true,
      isPersonal: true,
      requestedTab: "audit",
    };

    expect(
      resolveOrganizationSettingsTab({ ...base, isAnonymous: false })
    ).toBe("audit");
    expect(resolveOrganizationSettingsTab({ ...base, isAnonymous: true })).toBe(
      "general"
    );
    expect(
      resolveOrganizationSettingsTab({
        ...base,
        canReadAudit: false,
        isAnonymous: false,
      })
    ).toBe("general");
    expect(
      resolveOrganizationSettingsTab({
        ...base,
        isAnonymous: false,
        isOwner: false,
      })
    ).toBe("general");
  });
});

it("gates marketplaces by developer mode and owner access", () => {
  const params = {
    canReadAudit: false,
    canReadBackups: false,
    canReadBilling: false,
    canReadMembers: false,
    canReadTeams: false,
    isAnonymous: false,
    isOwner: true,
    isPersonal: false,
    requestedTab: "marketplaces",
    marketplacesEnabled: true,
  };
  expect(resolveOrganizationSettingsTab(params)).toBe("marketplaces");
  expect(
    resolveOrganizationSettingsTab({ ...params, marketplacesEnabled: false })
  ).toBe("general");
  expect(resolveOrganizationSettingsTab({ ...params, isOwner: false })).toBe(
    "general"
  );
  expect(resolveOrganizationSettingsTab({ ...params, isAnonymous: true })).toBe(
    "general"
  );
});
