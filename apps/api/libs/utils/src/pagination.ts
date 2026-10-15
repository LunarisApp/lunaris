import { BadRequestException } from "@nestjs/common";
import type { infer as Infer } from "zod";
import { z } from "zod";

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const PaginationQueryDto = paginationQuerySchema.meta({
  id: "PaginationQueryDto",
});
export type PaginationQueryDto = Infer<typeof PaginationQueryDto>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(
  cursor: string | undefined,
  parse: (value: unknown) => T,
): T | undefined {
  if (!cursor) return undefined;

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    return parse(JSON.parse(decoded));
  } catch {
    throw new BadRequestException("Invalid pagination cursor");
  }
}

export function toPage<Row, Item>(params: {
  encode: (row: Row) => unknown;
  limit: number;
  map: (row: Row) => Item;
  rows: Row[];
}): Page<Item> {
  const hasMore = params.rows.length > params.limit;
  const pageRows = hasMore ? params.rows.slice(0, params.limit) : params.rows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map(params.map),
    nextCursor: hasMore && last ? encodeCursor(params.encode(last)) : null,
  };
}
