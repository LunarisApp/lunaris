import { describe, expect, it, mock } from "bun:test";
import type { DatabaseService } from "@app/db";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { PermissionService } from "../security/permissions/permission.service";
import { PresenceAccessService } from "./presence-access.service";

const input = {
  organizationId: "org",
  workspaceId: "workspace",
  storageId: "slot",
  sessionId: "session",
  userId: "user",
};
// Exercise the real permission resolver and workspace-access path with ordered DB results.
function setup(results: unknown[][]) {
  const limit = mock(async () => results.shift() ?? []);
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit,
  };
  const database = {
    db: { select: () => chain },
  } as unknown as DatabaseService;
  return new PresenceAccessService(database, new PermissionService(database));
}
const viewer = [
  [{ id: "org" }],
  [{ visibility: "shared" }],
  [{ role: "viewer" }],
];
const identity = { id: "user", name: "  Ada  ", image: "javascript:alert(1)" };
describe("presence access", () => {
  it("allows a viewer and derives a bounded identity without email", async () => {
    const service = setup([
      ...viewer,
      [{ id: "workspace" }],
      [identity],
      [{ documentId: "doc", resourceId: "resource" }],
    ]);
    const result = await service.authorize(input);
    expect(result.user).toEqual({
      id: "user",
      name: "Ada",
      image: "",
      color: expect.stringMatching(/^#[a-f0-9]{6}$/),
    });
    expect(result.documentId).toBe("doc");
  });
  it("rejects missing organization membership", async () => {
    await expect(setup([[]]).authorize(input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it("rejects inaccessible workspaces", async () => {
    await expect(
      setup([...viewer, []]).authorize(input),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("rejects expired or revoked sessions", async () => {
    await expect(
      setup([...viewer, [{ id: "workspace" }], []]).authorize(input),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("rejects missing, trashed, or unassociated storage", async () => {
    await expect(
      setup([...viewer, [{ id: "workspace" }], [identity], []]).authorize(
        input,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

it("authorizes resource membership without any storage", async () => {
  const service = setup([
    ...viewer,
    [{ id: "workspace" }],
    [identity],
    [{ id: "resource" }],
  ]);
  const result = await service.authorize({
    ...input,
    kind: "resource",
    resourceId: "resource",
    storageId: "",
  });
  expect(result.resourceId).toBe("resource");
  expect(result.documentId).toBe("");
});
it("requires an enabled extension for generic channels", async () => {
  const request = {
    ...input,
    kind: "channel" as const,
    resourceId: "resource",
    extensionId: "example.plugin",
    channel: "selection",
  };
  await expect(
    setup([
      ...viewer,
      [{ id: "workspace" }],
      [identity],
      [{ id: "resource" }],
      [],
    ]).authorize(request),
  ).rejects.toBeInstanceOf(ForbiddenException);
  const result = await setup([
    ...viewer,
    [{ id: "workspace" }],
    [identity],
    [{ id: "resource" }],
    [{ id: "extension" }],
  ]).authorize(request);
  expect(result.channel).toBe("selection");
});

it("allows bundled defaults only while workspace extension configuration is empty", async () => {
  const request = {
    ...input,
    kind: "channel" as const,
    resourceId: "resource",
    extensionId: "lunaris.kanban",
    channel: "selection",
  };
  const base = [
    ...viewer,
    [{ id: "workspace" }],
    [identity],
    [{ id: "resource" }],
  ];
  expect((await setup([...base, [], []]).authorize(request)).channel).toBe(
    "selection",
  );
  await expect(
    setup([...base, [], [{ id: "disabled-extension" }]]).authorize(request),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
