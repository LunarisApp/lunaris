import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AppPermission } from "@repo/auth/permissions";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { FastifyRequest } from "fastify";
import {
  DEFER_PERMISSION_METADATA,
  PERMISSION_METADATA,
} from "./permission.decorator";
import { PermissionService } from "./permission.service";

type AuthenticatedRequest = FastifyRequest & {
  params?: { workspaceId?: string };
  session?: UserSession;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const deferred = this.reflector.getAllAndOverride<boolean>(
      DEFER_PERMISSION_METADATA,
      targets
    );
    if (deferred) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<
      AppPermission | undefined
    >(PERMISSION_METADATA, targets);

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return this.permissions.hasPermission(required, {
      organizationId: request.session?.session.activeOrganizationId,
      workspaceId: request.params?.workspaceId,
      userId: request.session?.user.id,
    });
  }
}
