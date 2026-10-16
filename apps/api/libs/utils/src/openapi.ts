import {
  applyDecorators,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiResponseNoStatusOptions,
  ApiResponseOptions,
} from "@nestjs/swagger";
import { SerializeOptions } from "@nestjs/common";
import type { ZodSchema } from "zod";

type ApiOperationOptions = Parameters<typeof ApiOperation>[0];

const defaultApiResponse: Record<
  "notFound" | "unauthorized" | "validationError",
  ApiResponseOptions
> = {
  validationError: {
    status: 400,
    description:
      "Returns an error if the request is missing required fields or contains invalid data.",
    example: {
      statusCode: 400,
      message: "Validation failed",
      errors: [
        {
          code: "too_small",
          minimum: 8,
          type: "string",
          inclusive: true,
          message: "String must contain at least 8 character(s)",
          path: ["password"],
        },
      ],
    },
  },
  unauthorized: {
    status: 401,
    description:
      "Returns an error if the user is not authorized to access the requested resource.",
  },
  notFound: {
    status: 404,
    description: "Returns an error if the requested resource is not found.",
  },
};

/**
 * A decorator for a POST request that creates a resource.
 * Means to respond wih HTTP 201 with the created resource.
 * Applies appropriate OpenAPI annotations and Zod serializer.
 * @param params
 * @constructor
 */
export function CreateApi(params: {
  path?: string | string[];
  serializer: ZodSchema;
  operation?: ApiOperationOptions;
  created?: ApiResponseNoStatusOptions;
}) {
  const { path, operation, serializer, created } = params;
  return applyDecorators(
    Post(path),
    ApiOperation(operation ?? {}),
    ApiCreatedResponse(
      created
        ? {
            standardSchema: serializer,
            ...created,
          }
        : {
            description: "Returns the created resource.",
            standardSchema: serializer,
          }
    ),
    ApiResponse(defaultApiResponse.validationError),
    ApiResponse(defaultApiResponse.unauthorized),
    SerializeOptions({ schema: serializer })
  );
}

/**
 * A decorator for a POST request to perform an action on a resource.
 * Means to respond wih HTTP 200 with the affected resource.
 * Applies appropriate OpenAPI annotations and Zod serializer.
 * @param params
 * @constructor
 */
export function ActionApi(params: {
  path?: string | string[];
  serializer: ZodSchema;
  operation?: ApiOperationOptions;
  ok?: ApiResponseNoStatusOptions;
}) {
  const { path, serializer, operation, ok } = params;
  return applyDecorators(
    Post(path),
    HttpCode(200),
    ApiOperation(operation ?? {}),
    ApiOkResponse(
      ok ?? {
        description: "Returns the affected resource.",
        standardSchema: serializer,
      }
    ),
    ApiResponse(defaultApiResponse.validationError),
    ApiResponse(defaultApiResponse.unauthorized),
    SerializeOptions({ schema: serializer })
  );
}

/**
 * A decorator for a GET request to retrieve a resource.
 * Means to respond wih HTTP 200 with the requested resource.
 * Applies appropriate OpenAPI annotations and Zod serializer.
 * @param params
 * @constructor
 */
export function RetrieveApi(params: {
  path?: string;
  serializer: ZodSchema;
  operation?: ApiOperationOptions;
  ok?: ApiResponseNoStatusOptions;
  opts?: {
    withUnauthorized?: boolean;
    withNotFound?: boolean;
  };
}) {
  const { path, operation, ok, serializer, opts } = params;
  const { withUnauthorized = true, withNotFound = true } = opts ?? {};
  const decorators = [
    Get(path),
    ApiOperation(operation ?? {}),
    ApiOkResponse(
      ok ?? {
        description: "Returns the requested resource.",
        standardSchema: serializer,
      }
    ),
    SerializeOptions({ schema: serializer }),
  ];
  if (withUnauthorized) {
    decorators.push(ApiResponse(defaultApiResponse.unauthorized));
  }
  if (withNotFound) {
    decorators.push(ApiResponse(defaultApiResponse.notFound));
  }
  return applyDecorators(...decorators);
}

/**
 * A decorator for a GET request to retrieve a list of resources.
 * Means to respond wih HTTP 200 with the list of resources.
 * Applies appropriate OpenAPI annotations and Zod paginated serializer.
 * @param params
 * @constructor
 */
export function ListApi(params: {
  path?: string;
  paginatedSerializer: ZodSchema;
  operation?: ApiOperationOptions;
  ok?: ApiResponseNoStatusOptions;
  opts?: {
    withUnauthorized?: boolean;
  };
}) {
  const { path, operation, ok, paginatedSerializer, opts } = params;
  const { withUnauthorized = true } = opts ?? {};
  const decorators = [
    Get(path),
    ApiOperation(operation ?? {}),
    ApiOkResponse(
      ok ?? {
        description: "Returns a list of resources.",
        standardSchema: paginatedSerializer,
      }
    ),
    SerializeOptions({ schema: paginatedSerializer }),
  ];
  if (withUnauthorized) {
    decorators.push(ApiResponse(defaultApiResponse.unauthorized));
  }
  return applyDecorators(...decorators);
}

/**
 * A decorator for a PATCH/PUT request to update a resource.
 * Means to respond wih HTTP 200 with the updated resource.
 * Applies appropriate OpenAPI annotations and Zod serializer.
 * @param params
 * @constructor
 */
export function UpdateApi(params: {
  serializer: ZodSchema;
  path?: string | string[];
  mode?: "PATCH" | "PUT";
  operation?: ApiOperationOptions;
  ok?: ApiResponseNoStatusOptions;
  opts?: {
    withUnauthorized?: boolean;
    withNotFound?: boolean;
    withValidationError?: boolean;
  };
}) {
  const { serializer, path, mode, operation, ok, opts } = params;
  const {
    withUnauthorized = true,
    withNotFound = true,
    withValidationError = true,
  } = opts ?? {};
  const decorators = [
    mode === "PUT" ? Put(path) : Patch(path),
    ApiOperation(operation ?? {}),
    ApiOkResponse(
      ok ?? {
        description: "Returns the updated resource.",
        standardSchema: serializer,
      }
    ),
    SerializeOptions({ schema: serializer }),
  ];
  if (withUnauthorized) {
    decorators.push(ApiResponse(defaultApiResponse.unauthorized));
  }
  if (withNotFound) {
    decorators.push(ApiResponse(defaultApiResponse.notFound));
  }
  if (withValidationError) {
    decorators.push(ApiResponse(defaultApiResponse.validationError));
  }
  return applyDecorators(...decorators);
}

/**
 * A decorator for a DELETE request to delete a resource.
 * Means to respond wih HTTP 200 with the ID of the deleted resource.
 * Applies appropriate OpenAPI annotations.
 * @param params
 * @constructor
 */
export function DeleteApi(params?: {
  path?: string | string[];
  operation?: ApiOperationOptions;
  ok?: ApiResponseNoStatusOptions;
  opts?: {
    withUnauthorized?: boolean;
    withNotFound?: boolean;
  };
}) {
  const { path, operation, ok, opts } = params ?? {};
  const { withUnauthorized = true, withNotFound = true } = opts ?? {};
  const decorators = [
    Delete(path),
    ApiOperation(operation ?? {}),
    ApiOkResponse(
      ok ?? {
        description: "Returns ID of the deleted resource.",
      }
    ),
  ];
  if (withUnauthorized) {
    decorators.push(ApiResponse(defaultApiResponse.unauthorized));
  }
  if (withNotFound) {
    decorators.push(ApiResponse(defaultApiResponse.notFound));
  }
  return applyDecorators(...decorators);
}
