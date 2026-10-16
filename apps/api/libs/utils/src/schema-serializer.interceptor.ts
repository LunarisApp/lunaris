import {
  Injectable,
  StandardSchemaSerializerInterceptor,
  StreamableFile,
} from "@nestjs/common";

/** API schemas describe the entire response, including arrays, primitives and null. */
@Injectable()
export class SchemaSerializerInterceptor extends StandardSchemaSerializerInterceptor {
  override async serialize(
    ...args: Parameters<StandardSchemaSerializerInterceptor["serialize"]>
  ): Promise<
    Awaited<ReturnType<StandardSchemaSerializerInterceptor["serialize"]>>
  > {
    const [response, schema, options] = args;
    if (!schema || response instanceof StreamableFile) {
      return response;
    }
    const result = await schema["~standard"].validate(response, options);
    if (result.issues) {
      throw new Error("Response schema validation failed", {
        cause: result.issues,
      });
    }
    // Nest's public return type excludes primitives, but Standard Schema supports them.
    return result.value as Awaited<
      ReturnType<StandardSchemaSerializerInterceptor["serialize"]>
    >;
  }
}
