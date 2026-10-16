import { describe, expect, it, mock } from "bun:test";
import { ConflictException } from "@nestjs/common";
import { AgentSafetyService, fingerprint } from "./agent-safety.service";

describe("AgentSafetyService", () => {
  it("fingerprints semantically identical objects consistently", () => {
    expect(fingerprint({ a: 1, nested: { b: 2, c: 3 } })).toBe(
      fingerprint({ nested: { c: 3, b: 2 }, a: 1 })
    );
  });

  it("rejects an idempotency key reused with different input", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      cause: {
        code: "23505",
        constraint: "agent_idempotency_actor_key_unique",
      },
    });
    const db = {
      insert: mock(() => ({
        values: mock(() => Promise.reject(duplicate)),
      })),
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            limit: mock(() =>
              Promise.resolve([
                {
                  expiresAt: new Date(Date.now() + 60_000),
                  operation: "create_workspace",
                  requestHash: fingerprint({ name: "First" }),
                  status: "complete",
                },
              ])
            ),
          })),
        })),
      })),
    };
    const service = new AgentSafetyService({ db } as never);

    await expect(
      service.idempotent({
        actorId: "user-1",
        key: "same-key",
        operation: "create_workspace",
        request: { name: "Second" },
        run: mock(() => Promise.resolve({ id: "never" })),
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("retries result persistence before returning a completed mutation", async () => {
    const remove = mock(() => ({
      where: mock(() => Promise.resolve()),
    }));
    let attempts = 0;
    const db = {
      delete: remove,
      insert: mock(() => ({ values: mock(() => Promise.resolve()) })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => {
            attempts += 1;
            return attempts < 3
              ? Promise.reject(new Error("write failed"))
              : Promise.resolve();
          }),
        })),
      })),
    };
    const service = new AgentSafetyService({ db } as never);

    await expect(
      service.idempotent({
        actorId: "user-1",
        key: "same-key",
        operation: "create_workspace",
        request: { name: "Workspace" },
        run: mock(() => Promise.resolve({ id: "workspace-1" })),
      })
    ).resolves.toEqual({ id: "workspace-1" });
    expect(attempts).toBe(3);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not report success when result persistence fails", async () => {
    const db = {
      insert: mock(() => ({ values: mock(() => Promise.resolve()) })),
      update: mock(() => ({
        set: mock(() => ({
          where: mock(() => Promise.reject(new Error("write failed"))),
        })),
      })),
    };
    const service = new AgentSafetyService({ db } as never);

    await expect(
      service.idempotent({
        actorId: "user-1",
        key: "same-key",
        operation: "create_workspace",
        request: { name: "Workspace" },
        run: mock(() => Promise.resolve({ id: "workspace-1" })),
      })
    ).rejects.toThrow("write failed");
  });

  it("cleans expired idempotency and preview records", async () => {
    const where = mock(() => Promise.resolve());
    const remove = mock(() => ({ where }));
    const service = new AgentSafetyService({ db: { delete: remove } } as never);

    await service.cleanupExpired();

    expect(remove).toHaveBeenCalledTimes(2);
    expect(where).toHaveBeenCalledTimes(2);
  });

  it("marks a preview used only after its mutation succeeds", async () => {
    const update = mock(() => ({
      set: mock(() => ({ where: mock(() => Promise.resolve()) })),
    }));
    const tx = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            for: mock(() => ({
              limit: mock(() =>
                Promise.resolve([
                  {
                    action: "delete_workspace",
                    actorId: "user-1",
                    expiresAt: new Date(Date.now() + 60_000),
                    fingerprint: "same",
                    id: "preview-1",
                    targetId: "workspace-1",
                    usedAt: null,
                    organizationId: "organization-1",
                  },
                ])
              ),
            })),
          })),
        })),
      })),
      update,
    };
    const transaction = mock(
      (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)
    );
    const service = new AgentSafetyService({ db: { transaction } } as never);

    await expect(
      service.executePreview({
        action: "delete_workspace",
        actorId: "user-1",
        fingerprint: mock(() => Promise.resolve("same")),
        previewToken: "preview-token",
        run: mock(() => Promise.reject(new Error("delete failed"))),
        targetId: "workspace-1",
        organizationId: "organization-1",
      })
    ).rejects.toThrow("delete failed");

    expect(update).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "serializable",
    });
  });
});
