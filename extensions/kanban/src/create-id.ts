import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
  "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  20
);

type NoUnderscore<T extends string> = T extends `${string}_${string}`
  ? ["Error: underscores are not allowed in ID prefix.", T]
  : T;

export function createId<T extends string>(prefix: NoUnderscore<T>) {
  return `${prefix}_${nanoid()}`;
}
