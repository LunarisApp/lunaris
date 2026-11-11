/** @vitest-environment happy-dom */
import { WORKSPACE_VISIBILITY } from "@repo/auth/sync-access";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Doc } from "yjs";
import {
  createImportLinkResolver,
  createObsidianImportPlan,
  createObsidianImportSession,
  getImportStats,
  getRemainingImportCount,
  importObsidianWorkspace,
  type ImportDirectory,
} from "./obsidian-import-service";

const mocks = vi.hoisted(() => ({
  file: vi.fn(),
  folder: vi.fn(),
  resource: vi.fn(),
  workspace: vi.fn(),
  extensions: vi.fn(),
}));
vi.mock("@repo/data/features/files", async (original) => ({
  ...(await original<typeof import("@repo/data/features/files")>()),
  createLocalFileWorkspaceResource: mocks.file,
}));
vi.mock("@repo/data/features/workspace-extensions", () => ({
  replaceWorkspaceExtensions: mocks.extensions,
}));
vi.mock("@repo/data/features/workspace-resources", () => ({
  WORKSPACE_RESOURCES_TABLE: "workspace_resources",
  LOCAL_WORKSPACE_RESOURCES_TABLE: "local_workspace_resources",
  createWorkspaceFolder: mocks.folder,
  createWorkspaceResource: mocks.resource,
}));
vi.mock("@repo/data/features/workspaces", () => ({
  createWorkspace: mocks.workspace,
}));
vi.mock("evlog", async (original) => ({
  ...(await original<typeof import("evlog")>()),
  log: { info: vi.fn() },
}));
function file(name: string, content = "# Note", type = "") {
  return {
    kind: "file" as const,
    name,
    file: new File([content], name, { type }),
  };
}
function vault(children: ImportDirectory["children"]): ImportDirectory {
  return { name: "Vault", children };
}
const data = {
  name: "Vault",
  organizationId: "org_1",
  slug: "vault",
  visibility: WORKSPACE_VISIBILITY.local,
};
function reservation() {
  return { commit: vi.fn(), rollback: vi.fn() };
}
function run(
  directory: ImportDirectory,
  extra: Partial<Parameters<typeof importObsidianWorkspace>[0]> = {}
) {
  return importObsidianWorkspace({
    allExtensionIds: ["lunaris.rich-text", "lunaris.file"],
    data,
    db: {} as never,
    directory,
    resourceCapacityReservation: reservation(),
    ...extra,
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue("workspace_1");
  mocks.folder.mockImplementation(
    async ({ name, parentId }) => `${parentId ?? "root"}/${name}`
  );
  mocks.file.mockImplementation(async ({ id, file }) => ({
    id,
    name: file.name,
    storageId: `storage_${id}`,
  }));
  mocks.resource.mockImplementation(async ({ id, storage }) => {
    const doc = new Doc();
    try {
      storage.content.initialize(doc);
    } finally {
      doc.destroy();
    }
    return { id };
  });
});
describe("Obsidian import", () => {
  it("uses the same plan for counts and import, including unsupported-only subtrees and empty MIME JPEG", async () => {
    const directory = vault([
      {
        kind: "folder",
        name: "Ignored",
        children: [file("a.exe"), file("b.exe")],
      },
      {
        kind: "folder",
        name: "Drafts",
        children: [file("Intro.md"), file("photo.jpeg")],
      },
      { kind: "folder", name: ".git", children: [file("secret")] },
    ]);
    const plan = createObsidianImportPlan(directory);
    expect(plan.stats).toEqual({
      convertedMarkdownCount: 1,
      folderCount: 3,
      originalFileCount: 2,
      skippedCount: 3,
    });
    expect(plan.resourceCount).toBe(6);
    const capacity = reservation();
    const result = await run(directory, {
      resourceCapacityReservation: capacity,
    });
    expect(result.stats).toEqual(plan.stats);
    expect(result.complete).toBe(true);
    expect(mocks.folder).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ignored" })
    );
    expect(capacity.commit).toHaveBeenCalledWith(6);
    expect(capacity.rollback).toHaveBeenCalledOnce();
    expect(mocks.file).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "root/Original Files/Drafts" })
    );
  });
  it("avoids source resources when retention is disabled", async () => {
    const directory = vault([file("Note.md")]);
    const plan = createObsidianImportPlan(directory, false);
    expect(plan.resourceCount).toBe(1);
    expect(plan.retainedFileBytes).toBe(0);
    expect(getImportStats(directory).originalFileCount).toBe(1);
    await run(directory, { session: createObsidianImportSession(plan) });
    expect(mocks.file).not.toHaveBeenCalled();
    expect(mocks.folder).not.toHaveBeenCalled();
  });
  it("retains sources before note writes and retries only failures in the same workspace", async () => {
    const directory = vault([file("Note.md"), file("Other.md")]);
    const session = createObsidianImportSession(
      createObsidianImportPlan(directory)
    );
    const capacity = reservation();
    mocks.resource.mockRejectedValueOnce(new Error("disk full"));
    const first = await run(directory, {
      session,
      resourceCapacityReservation: capacity,
    });
    expect(first.complete).toBe(false);
    expect(first.stats.originalFileCount).toBe(2);
    expect(capacity.commit).toHaveBeenCalledWith(4);
    expect(getRemainingImportCount(session)).toBe(1);
    const id = mocks.resource.mock.calls[0]![0].id;
    const second = await run(directory, { session });
    expect(second.complete).toBe(true);
    expect(mocks.workspace).toHaveBeenCalledOnce();
    expect(mocks.extensions).toHaveBeenCalledOnce();
    expect(mocks.file).toHaveBeenCalledTimes(2);
    expect(mocks.resource).toHaveBeenCalledTimes(3);
    expect(mocks.resource.mock.calls[2]![0].id).toBe(id);
  });
  it("retries setup without creating a second workspace", async () => {
    const directory = vault([file("Note.md")]);
    const session = createObsidianImportSession(
      createObsidianImportPlan(directory)
    );
    mocks.extensions.mockRejectedValueOnce(new Error("setup failed"));
    const capacity = reservation();
    await expect(
      run(directory, { session, resourceCapacityReservation: capacity })
    ).rejects.toThrow("setup failed");
    expect(capacity.commit).toHaveBeenCalledWith(0);
    expect(capacity.rollback).toHaveBeenCalledOnce();
    await run(directory, { session });
    expect(mocks.workspace).toHaveBeenCalledOnce();
  });
  it("cancels between resources and resumes without duplicates", async () => {
    const directory = vault([file("One.md"), file("Two.md")]);
    const session = createObsidianImportSession(
      createObsidianImportPlan(directory, false)
    );
    const controller = new AbortController();
    const capacity = reservation();
    const result = await run(directory, {
      session,
      signal: controller.signal,
      resourceCapacityReservation: capacity,
      onProgress: ({ completed }) => {
        if (completed === 1) {
          controller.abort();
        }
      },
    });
    expect(result.cancelled).toBe(true);
    expect(getRemainingImportCount(session)).toBe(1);
    expect(capacity.commit).toHaveBeenCalledWith(1);
    await run(directory, { session });
    expect(mocks.resource).toHaveBeenCalledTimes(2);
  });
  it("releases capacity without creating a workspace when already cancelled", async () => {
    const capacity = reservation();
    await expect(
      run(vault([file("Note.md")]), {
        signal: AbortSignal.abort(),
        resourceCapacityReservation: capacity,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(capacity.commit).toHaveBeenCalledWith(0);
    expect(capacity.rollback).toHaveBeenCalledOnce();
  });
  it("waits for failed attachments before converting dependent notes", async () => {
    const directory = vault([
      file("Note.md", "![[photo.jpeg]]"),
      file("photo.jpeg"),
    ]);
    const session = createObsidianImportSession(
      createObsidianImportPlan(directory, false)
    );
    mocks.file.mockRejectedValueOnce(new Error("attachment failed"));
    await run(directory, { session });
    expect(mocks.resource).not.toHaveBeenCalled();
    expect(getRemainingImportCount(session)).toBe(2);
    await run(directory, { session });
    expect(mocks.resource).toHaveBeenCalledOnce();
    expect(getRemainingImportCount(session)).toBe(0);
  });
  it("indexes forward aliases and retains properties and warned source in metadata", async () => {
    const directory = vault([
      file("Start.md", "[[Alias]] [[Missing]]"),
      file(
        "Target.md",
        "---\naliases: [Alias]\ntags: [project]\n---\n# Target"
      ),
    ]);
    const result = await run(directory);
    expect(result.session.results.get("working:Start.md")?.warnings).toEqual([
      "unresolved-link",
    ]);
    const start = mocks.resource.mock.calls.find(
      ([params]) => params.name === "Start"
    )![0];
    const target = mocks.resource.mock.calls.find(
      ([params]) => params.name === "Target"
    )![0];
    expect(start.storage.obsidian.initialize().source).toBe(
      "[[Alias]] [[Missing]]"
    );
    expect(target.storage.obsidian.initialize().tags).toEqual(["project"]);
    expect(target.storage.obsidian.initialize().sourcePath).toBe("Target.md");
  });
  it("resolves relative paths, root paths, self anchors and rejects ambiguous basenames", () => {
    const directory = vault([
      {
        kind: "folder",
        name: "A",
        children: [file("Note.md"), file("Index.md")],
      },
      { kind: "folder", name: "B", children: [file("Note.md")] },
      file("Root.md"),
      file("Space Name.md"),
    ]);
    const session = createObsidianImportSession(
      createObsidianImportPlan(directory)
    );
    session.workspaceId = "workspace_1";
    const resolve = createImportLinkResolver(session)("A/Index.md");
    expect(resolve("../Root.md", false).reference?.resourceId).toBe(
      session.resourceIds.get("working:Root.md")
    );
    expect(resolve("/B/Note.md", false).reference?.resourceId).toBe(
      session.resourceIds.get("working:B/Note.md")
    );
    expect(resolve("Space%20Name.md", false).reference?.resourceId).toBe(
      session.resourceIds.get("working:Space Name.md")
    );
    expect(resolve("#Heading", true).reference?.resourceId).toBe(
      session.resourceIds.get("working:A/Index.md")
    );
    expect(
      createImportLinkResolver(session)("Root.md")("Note", true).warning
    ).toBe("ambiguous-link");
  });
  it("distinguishes encoded filename characters from anchors and accepts uppercase Markdown extensions", () => {
    const session = createObsidianImportSession(
      createObsidianImportPlan(
        vault([
          file("Name.md"),
          file("Name#part.md"),
          file("Name?part.md"),
          { kind: "folder", name: "Folder", children: [file("Target.MD")] },
        ])
      )
    );
    session.workspaceId = "workspace_1";
    const resolve = createImportLinkResolver(session)("Name.md");
    expect(resolve("Name%23part.md#Heading", false).reference?.resourceId).toBe(
      session.resourceIds.get("working:Name#part.md")
    );
    expect(resolve("Name%3Fpart.md", false).reference?.resourceId).toBe(
      session.resourceIds.get("working:Name?part.md")
    );
    expect(resolve("Folder/Target", true).reference?.resourceId).toBe(
      session.resourceIds.get("working:Folder/Target.MD")
    );
  });
  it("rejects ambiguous short names across filenames and aliases", () => {
    const session = createObsidianImportSession(
      createObsidianImportPlan(
        vault([
          { kind: "folder", name: "A", children: [file("Note.md")] },
          file("Other.md"),
        ])
      )
    );
    session.aliases.set("Note", new Set(["Other.md"]));
    const resolve = createImportLinkResolver(session)("Index.md");
    expect(resolve("Note", true).warning).toBe("ambiguous-link");
  });
});
