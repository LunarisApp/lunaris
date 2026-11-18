// Preserve the former Fastify limit when Better Auth installs Express parsers.
const API_BODY_LIMIT = 1024 * 1024;

export const API_BODY_PARSER_OPTIONS = {
  json: { limit: API_BODY_LIMIT },
  urlencoded: { limit: API_BODY_LIMIT },
};
