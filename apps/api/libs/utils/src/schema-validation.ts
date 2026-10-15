import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import type { StandardSchemaValidationPipeOptions } from "@nestjs/common";

type Issues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions["exceptionFactory"]>
>[0];

export class SchemaValidationException extends BadRequestException {
  constructor(readonly issues: Issues) {
    super({
      statusCode: 400,
      message: "Validation failed",
      reason: "validation.failed",
    });
  }
}

export function createSchemaValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) => new SchemaValidationException(issues),
  });
}
