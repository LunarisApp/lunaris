import { describe, expect, it } from "bun:test";
import { createAuth } from "@repo/auth/server";
import { enterpriseTeams } from "./teams";
describe("enterprise teams", () => {
  it("enables organization team endpoints", () => {
    const auth = createAuth({} as never, {
      frontendUrl: "https://app.lunaris.app",
      organizationTeams: enterpriseTeams,
    });

    const organizationPlugin = auth.options.plugins?.find(
      (plugin) => plugin.id === "organization",
    );

    expect(organizationPlugin?.endpoints).toHaveProperty("createTeam");
    expect(organizationPlugin?.endpoints).toHaveProperty(
      "listOrganizationTeams",
    );
    expect(organizationPlugin?.endpoints).toHaveProperty("addTeamMember");
  });

});
