import type { ZodSchema } from "zod";

export const createEnv = (
  schema: ZodSchema,
  envVars: Record<string, unknown>,
) => {
  const parsedEnv = schema.safeParse(envVars);

  if (!parsedEnv.success) {
    throw new Error(
      `Invalid env provided.
The following variables are missing or invalid:
${Object.entries(parsedEnv.error.flatten().fieldErrors)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}
`
    );
  }

  return parsedEnv.data;
};
