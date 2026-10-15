import { describe, expect, it } from "bun:test";
import {
  hasOrganizationPermission,
  organizationAccessControl,
  organizationRoles,
  permission,
  permissionStatement,
  resolveOrganizationRole,
} from "./permissions";

describe("organization permissions", () => {
  it("exposes every statement action through the typed catalog", () => {
    for (const [resource, actions] of Object.entries(permissionStatement)) {
      expect(Object.keys(permission[resource as keyof typeof permission])).toEqual(
        [...actions],
      );
    }
  });

  it("configures Better Auth with the same statements", () => {
    expect(organizationAccessControl.statements).toEqual(permissionStatement);
  });

  it("represents a permission as a resource and action pair", () => {
    expect(permission.content.write).toEqual({
      action: "write",
      resource: "content",
    });
  });

  it("keeps capability and persistence details out of the vocabulary", () => {
    expect(permissionStatement).not.toHaveProperty("entitlement");
    expect(permissionStatement).not.toHaveProperty("sync");
    expect(permissionStatement).not.toHaveProperty("workspaceResource");
    expect(permissionStatement).not.toHaveProperty("document");
    expect(permissionStatement).not.toHaveProperty("workspaceData");
  });

  it("gives owners every declared permission", () => {
    for (const [resource, actions] of Object.entries(permission)) {
      for (const required of Object.values(actions)) {
        expect(hasOrganizationPermission("owner", required)).toBe(true);
      }
    }
    expect(organizationRoles.owner.statements).toEqual(permissionStatement);
  });

  it("lets editors manage content without organization administration", () => {
    expect(hasOrganizationPermission("editor", permission.workspace.create)).toBe(
      true,
    );
    expect(hasOrganizationPermission("editor", permission.content.write)).toBe(
      true,
    );
    expect(hasOrganizationPermission("editor", permission.member.read)).toBe(
      true,
    );
    expect(hasOrganizationPermission("editor", permission.member.create)).toBe(
      false,
    );
    expect(hasOrganizationPermission("editor", permission.billing.read)).toBe(
      false,
    );
  });

  it("keeps viewers read-only", () => {
    expect(hasOrganizationPermission("viewer", permission.workspace.read)).toBe(
      true,
    );
    expect(hasOrganizationPermission("viewer", permission.content.read)).toBe(
      true,
    );
    expect(hasOrganizationPermission("viewer", permission.workspace.update)).toBe(
      false,
    );
    expect(hasOrganizationPermission("viewer", permission.content.write)).toBe(
      false,
    );
  });

  it("maps legacy roles to the least-surprising standard role", () => {
    expect(hasOrganizationPermission("admin", permission.content.write)).toBe(
      true,
    );
    expect(hasOrganizationPermission("admin", permission.member.create)).toBe(
      false,
    );
    expect(hasOrganizationPermission("member", permission.content.read)).toBe(
      true,
    );
    expect(hasOrganizationPermission("member", permission.content.write)).toBe(
      true,
    );
    expect(resolveOrganizationRole("member,admin")).toBe("editor");
    expect(resolveOrganizationRole("viewer,owner")).toBe("owner");
  });
});
