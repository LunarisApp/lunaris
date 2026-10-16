import { parseUTCTimestamp } from "@repo/utils";

/** Compare instants, including PostgreSQL timestamps without a timezone suffix. */
export function latestTimestamp(
  ...values: (string | null | undefined)[]
): Date | null {
  let latest: Date | null = null;
  for (const value of values) {
    if (!value) {
      continue;
    }
    const date = parseUTCTimestamp(value);
    if (Number.isFinite(date.getTime()) && (!latest || date > latest)) {
      latest = date;
    }
  }
  return latest;
}
