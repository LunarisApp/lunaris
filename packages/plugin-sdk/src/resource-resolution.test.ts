import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { resolveResource, type ResourceVersionCommitter } from "./resource-resolution";
import type { ResourceEnvelope, ResourceTypeDefinition } from "./types";

const envelope = (schemaVersion: number): ResourceEnvelope => ({
  parentId: null,
  resourceId: "res_1",
  resourceTypeId: "acme.note",
  schemaId: "acme.note.schema",
  schemaVersion,
});

function definition(payload: { value: number }, write = vi.fn()): ResourceTypeDefinition {
  return {
    icon: [],
    name: "Note",
    resourceTypeId: "acme.note",
    schema: {
      currentVersion: 3,
      id: "acme.note.schema",
      migrations: [
        { from: 1, migrate: (value) => ({ value: (value as { value: number }).value + 1 }), to: 2 },
        { from: 2, migrate: (value) => ({ value: (value as { value: number }).value + 1 }), to: 3 },
      ],
      read: () => payload,
      versions: {
        1: z.object({ value: z.number() }),
        2: z.object({ value: z.number().min(2) }),
        3: z.object({ value: z.number().min(3) }),
      },
      write,
    },
    storage: { content: { kind: "yjs" } },
  };
}

function committer(result = true): ResourceVersionCommitter {
  return {
    compareAndSet: vi.fn(async ({ writePayload }) => {
      if (result) await writePayload();
      return result;
    }),
  };
}

describe("resource resolution", () => {
  it("validates current payloads without writing", async () => {
    const write = vi.fn();
    const result = await resolveResource(
      definition({ value: 3 }, write),
      envelope(3),
      { resourceId: "res_1", storage: {} },
      committer(),
    );
    expect(result).toMatchObject({ status: "ready", payload: { value: 3 } });
    expect(write).not.toHaveBeenCalled();
  });

  it("runs and validates every migration before one compare-and-set commit", async () => {
    const write = vi.fn();
    const versionCommitter = committer();
    const result = await resolveResource(
      definition({ value: 1 }, write),
      envelope(1),
      { resourceId: "res_1", storage: {} },
      versionCommitter,
    );
    expect(result).toMatchObject({
      envelope: { schemaVersion: 3 },
      payload: { value: 3 },
      status: "ready",
    });
    expect(versionCommitter.compareAndSet).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, nextVersion: 3 }),
    );
    expect(write).toHaveBeenCalledOnce();
  });

  it("quarantines compare-and-set conflicts without writing", async () => {
    const write = vi.fn();
    const result = await resolveResource(
      definition({ value: 1 }, write),
      envelope(1),
      { resourceId: "res_1", storage: {} },
      committer(false),
    );
    expect(result).toMatchObject({ retryable: true, status: "quarantined" });
    expect(write).not.toHaveBeenCalled();
  });

  it("re-reads and validates after a compare-and-set conflict", async () => {
    const write = vi.fn();
    const resource = definition({ value: 1 }, write);
    resource.schema.read = vi
      .fn()
      .mockReturnValueOnce({ value: 1 })
      .mockReturnValueOnce({ value: 3 });
    const versionCommitter: ResourceVersionCommitter = {
      compareAndSet: vi.fn().mockResolvedValue(false),
      readVersion: vi.fn().mockResolvedValue(3),
    };

    const result = await resolveResource(
      resource,
      envelope(1),
      { resourceId: "res_1", storage: {} },
      versionCommitter,
    );

    expect(result).toMatchObject({
      envelope: { schemaVersion: 3 },
      payload: { value: 3 },
      status: "ready",
    });
    expect(resource.schema.read).toHaveBeenCalledTimes(2);
    expect(write).not.toHaveBeenCalled();
  });

  it("quarantines newer and corrupt resources without mutating them", async () => {
    const write = vi.fn();
    const versionCommitter = committer();
    const newer = await resolveResource(
      definition({ value: 4 }, write),
      envelope(4),
      { resourceId: "res_1", storage: {} },
      versionCommitter,
    );
    const corrupt = await resolveResource(
      definition({ value: 0 }, write),
      envelope(2),
      { resourceId: "res_1", storage: {} },
      versionCommitter,
    );
    expect(newer).toMatchObject({ retryable: false, status: "quarantined" });
    expect(corrupt).toMatchObject({ retryable: true, status: "quarantined" });
    expect(versionCommitter.compareAndSet).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
