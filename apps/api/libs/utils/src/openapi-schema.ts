import type { SwaggerDocumentOptions } from "@nestjs/swagger";
import { z } from "zod";

/** Dates are accepted as query strings and coerced by the validation pipe. */
export const standardSchemaConverter: SwaggerDocumentOptions["standardSchemaConverter"] =
  (schema, { schemaType }) => {
    if (!(schema instanceof z.ZodType)) {
      return;
    }
    const converted = z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: schemaType,
      unrepresentable: "any",
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema instanceof z.ZodDate) {
          jsonSchema.type = "string";
          jsonSchema.format = "date-time";
        }
      },
    });
    const {
      definitions = {},
      $defs = {},
      $schema: _dialect,
      ...root
    } = converted;
    const components: Record<string, unknown> = {
      ...(typeof definitions === "object" && definitions !== null
        ? definitions
        : {}),
      ...$defs,
    };
    // Nest expands whole-object query parameters only from an inline root schema.
    const name = root.$ref?.replace(/^#\/(?:definitions|\$defs)\//, "");
    return {
      schema: name && components[name] ? components[name] : root,
      components,
    };
  };
