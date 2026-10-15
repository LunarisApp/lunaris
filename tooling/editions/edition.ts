export type Edition = "community" | "enterprise";

export function readEdition(value = process.env.LUNARIS_EDITION): Edition {
  if (value === undefined || value === "community") return "community";
  if (value === "enterprise") return "enterprise";
  throw new Error(`Invalid LUNARIS_EDITION: ${value}. Use community or enterprise.`);
}
