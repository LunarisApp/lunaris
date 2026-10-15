import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  20
);

/**
 * Type guard to disallow underscore characters from being used as part of an ID prefix.
 */
type NoUnderscore<T extends string> = T extends `${string}_${string}`
  ? ["Error: underscores are not allowed in ID prefix.", T]
  : T;

/**
 * Create a unique ID with the given prefix.
 * @param prefix
 */
export function createId<T extends string>(prefix: NoUnderscore<T>) {
  return `${prefix}_${nanoid()}`;
}
