import { AppError } from "@app/utils/errors";
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { log, type RequestLogger } from "evlog";
import { useLogger } from "evlog/nestjs";
import { SchemaValidationException } from "./schema-validation";
import { catchError, Observable } from "rxjs";

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    handler: CallHandler
  ): Observable<unknown> {
    return handler.handle().pipe(
      catchError((error) => {
        const timestamp = new Date().toISOString();

        let requestLog: RequestLogger | undefined;
        let requestId: string | undefined;
        try {
          requestLog = useLogger();
          requestId = requestLog.getContext().requestId as string | undefined;
        } catch {
          // Outside request context — no logger available
        }

        if (error instanceof SchemaValidationException) {
          requestLog?.set({
            validation: {
              issues: error.issues.map((issue) => ({
                path: issue.path
                  ?.map((segment) =>
                    typeof segment === "object" ? segment.key : segment
                  )
                  .join("."),
                message: issue.message,
              })),
            },
          });
          requestLog?.error(error);
          // Keep field-level diagnostics in logs, never in the public envelope.
          throw new HttpException(
            {
              statusCode: 400,
              message: "Validation failed",
              reason: "validation.failed",
              timestamp,
              requestId,
            },
            400
          );
        }

        if (error instanceof AppError) {
          requestLog?.error(error);

          // Loud feedback in development when an AppError lands without a
          // typed reason — the frontend display contract expects every
          // domain error to carry one for i18n mapping.
          if (!error.reason && process.env.NODE_ENV !== "production") {
            log.warn({
              context: "ErrorInterceptor",
              message: "AppError thrown without a typed reason",
              args: [{ name: error.name, status: error.status }],
            });
          }
          throw new HttpException(
            {
              statusCode: error.status,
              message: error.message,
              why: error.why,
              fix: error.fix,
              link: error.link,
              reason: error.reason,
              timestamp,
              requestId,
            },
            error.status
          );
        }

        if (error instanceof HttpException) {
          const response = error.getResponse();
          const status = error.getStatus();
          const original =
            typeof response === "object" ? response : { message: response };
          requestLog?.error(error);

          throw new HttpException(
            { ...original, timestamp, requestId },
            status
          );
        }

        requestLog?.error(
          error instanceof Error ? error : new Error(String(error))
        );
        Sentry.captureException(error);

        throw new HttpException(
          {
            statusCode: 500,
            message: "Internal Server Error",
            reason: "server.internal",
            details:
              "We have encountered an unexpected error. Our team is already working to resolve the issue.",
            timestamp,
            requestId,
          },
          500
        );
      })
    );
  }
}
