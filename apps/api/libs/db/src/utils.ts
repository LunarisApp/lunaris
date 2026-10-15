import { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgTransaction } from "drizzle-orm/pg-core";

export type DrizzleTransaction = PgTransaction<
  NodePgQueryResultHKT,
  Record<string, unknown>,
  ExtractTablesWithRelations<Record<string, never>>
>;
export type DrizzleDatabase = ReturnType<typeof drizzle>;
export type DatabaseOrTx = DrizzleDatabase | DrizzleTransaction;

import assert from "node:assert";
import { sql } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

// Custom type for handling bytea data in PostgreSQL.
// https://github.com/drizzle-team/drizzle-orm/issues/298#issuecomment-3223856537
const HEX_ESCAPE_REGEX = /\\x/g;
export const bytea = customType<{
  data: Buffer;
  notNull: false;
  default: false;
}>({
  dataType() {
    return "bytea";
  },
  toDriver(value: unknown) {
    assert(value instanceof Buffer);

    return sql`decode(${value.toString("hex")}, 'hex')`;
  },
  fromDriver(value: unknown): Buffer {
    if (value instanceof Buffer) {
      return value;
    }

    if (value instanceof Uint8Array) {
      return Buffer.from(value);
    }

    if (typeof value === "string") {
      return Buffer.from(value.replace(HEX_ESCAPE_REGEX, ""), "hex");
    }

    assert.fail(`Cannot convert type: '${typeof value}' to Buffer`);
  },
});
