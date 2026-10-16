import { ArgumentsHost, Catch, ForbiddenException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { createLogger } from "evlog";
import { useLogger } from "evlog/nestjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import { OriginRejectedException } from "./origin-protection";

const NATIVE_CSRF_MESSAGES = new Set([
  "Cross-origin request detected from Sec-Fetch-Site header",
  "Cross-origin request detected, and/or browser is out of date: Sec-Fetch-Site is missing, and Origin does not match Host",
]);

@Catch(ForbiddenException)
export class OriginExceptionFilter extends BaseExceptionFilter<ForbiddenException> {
  catch(exception: ForbiddenException, host: ArgumentsHost) {
    if (
      !(
        exception instanceof OriginRejectedException ||
        NATIVE_CSRF_MESSAGES.has(exception.message)
      )
    ) {
      return super.catch(exception, host);
    }
    const request = host.switchToHttp().getRequest<FastifyRequest>();
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let requestId = request.id;
    // Never infer an actor or tenant before authentication, or log credentials.
    try {
      const logger = useLogger();
      requestId = String(logger.getContext().requestId ?? requestId);
      logger.set({ security: { reason: "auth.csrf_invalid" } });
      logger.warn("Cross-origin request rejected");
    } catch {
      const logger = createLogger({
        context: "OriginProtection",
        requestId,
        security: { reason: "auth.csrf_invalid" },
      });
      logger.warn("Cross-origin request rejected");
      logger.emit();
    }
    reply.status(403).send({
      statusCode: 403,
      message: "Request origin is not allowed",
      reason: "auth.csrf_invalid",
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
