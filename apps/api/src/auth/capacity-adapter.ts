import type { DatabaseService } from "@app/db";
import type { EntitlementsService } from "../entitlements";
import { OrganizationPlanMemberLimitError } from "../entitlements/core/entitlements.errors";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type Where = Parameters<Adapter["findOne"]>[0]["where"];

/** Guard the actual auth writes, including invitation resend and acceptance. */
export function capacityAdapter(
  database: DatabaseService,
  schema: NonNullable<Parameters<typeof drizzleAdapter>[1]["schema"]>,
  entitlements: Pick<EntitlementsService, "withMemberCapacity">,
): AdapterFactory {
  return (options) => {
    const config = { provider: "pg" as const, schema };
    const adapter = drizzleAdapter(database.db, config)(options);
    const guarded = (model: string) => model === "member" || model === "invitation";
    const run = async <T>(organizationId: string, write: (tx: Adapter) => Promise<T>) => {
      try {
        return await entitlements.withMemberCapacity(organizationId, (tx) =>
          write(drizzleAdapter(tx, config)(options)),
        );
      } catch (error) {
        if (!(error instanceof OrganizationPlanMemberLimitError)) throw error;
        throw new APIError("FORBIDDEN", {
          code: "ORGANIZATION_MEMBER_LIMIT_REACHED",
          message: "Organization member limit reached.",
        });
      }
    };
    const mutate = async <T>(model: string, where: Where, write: (tx: Adapter) => Promise<T>) => {
      if (!guarded(model)) return write(adapter);
      const row = await adapter.findOne<{ organizationId: string }>({ model, where });
      if (!row) throw new APIError("NOT_FOUND");
      return run(row.organizationId, write);
    };
    const guardedAdapter: Adapter = {
      ...adapter,
      // The configured Drizzle adapter uses per-operation transactions. Preserve
      // that behavior without handing Better Auth an unguarded adapter in callbacks.
      transaction: (callback) => callback(guardedAdapter),
      create: (input) => {
        if (!guarded(input.model)) return adapter.create(input);
        const organizationId = input.data.organizationId;
        if (typeof organizationId !== "string") throw new APIError("BAD_REQUEST");
        return run(organizationId, (tx) => tx.create(input));
      },
      update: (input) => {
        // Auth resource scopes are immutable; prevents locking the wrong tenant.
        if (guarded(input.model) && "organizationId" in input.update) {
          throw new APIError("BAD_REQUEST", { message: "Organization scope cannot be changed." });
        }
        const next = input.model === "invitation" && input.update.status
          ? { ...input, update: { ...input.update, seatReserved: input.update.status === "accepted" } }
          : input;
        return mutate(input.model, input.where, (tx) => tx.update(next));
      },
      incrementOne: (input) => {
        if (guarded(input.model) && input.set && "organizationId" in input.set) throw new APIError("BAD_REQUEST");
        const next = input.model === "invitation" && input.set?.status
          ? { ...input, set: { ...input.set, seatReserved: input.set.status === "accepted" } }
          : input;
        return mutate(input.model, input.where, (tx) => tx.incrementOne(next));
      },
      delete: (input) => mutate(input.model, input.where, (tx) => tx.delete(input)),
      consumeOne: (input) => mutate(input.model, input.where, (tx) => tx.consumeOne(input)),
      deleteMany: async (input) => {
        if (!guarded(input.model)) return adapter.deleteMany(input);
        const limit = await adapter.count(input);
        if (!limit) return 0;
        const rows = await adapter.findMany<{ id: string; organizationId: string }>({ ...input, limit });
        let deleted = 0;
        for (const row of rows) {
          deleted += await run(row.organizationId, (tx) => tx.deleteMany({
            ...input, where: [...input.where, { field: "id", value: row.id }],
          }));
        }
        return deleted;
      },
      updateMany: (input) => {
        if (guarded(input.model)) throw new APIError("BAD_REQUEST", { message: "Bulk membership changes are unsupported." });
        return adapter.updateMany(input);
      },
    };
    return guardedAdapter;
  };
}
