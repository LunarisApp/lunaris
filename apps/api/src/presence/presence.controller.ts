import {
  Body,
  Controller,
  Param,
  Post,
  Res,
  BadRequestException,
} from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import type { FastifyReply } from "fastify";
import { RequirePermission } from "../security/permissions/permission.decorator";
import { UserDataAccessService } from "../workspaces/core/user-data-access.service";
import { PresenceAccessService } from "./presence-access.service";
import { PresenceRelay } from "./presence-relay";

@Controller("workspaces/:workspaceId")
export class PresenceController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly presence: PresenceAccessService,
    private readonly relay: PresenceRelay
  ) {}

  @Post("storage/:storageId/presence/ticket")
  @RequirePermission(permission.content.read)
  async ticket(
    @Session() session: UserSession,
    @Param("workspaceId") workspaceId: string,
    @Param("storageId") storageId: string,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    reply.header("Cache-Control", "no-store");
    const principal = await this.access.requireOrganization(session);
    const identity = await this.presence.authorize({
      ...principal,
      workspaceId,
      storageId,
      sessionId: session.session.id,
    });
    return { ticket: await this.relay.issue(identity), user: identity.user };
  }
  @Post("resources/:resourceId/presence/ticket")
  @RequirePermission(permission.content.read)
  async resourceTicket(
    @Session() session: UserSession,
    @Param("workspaceId") workspaceId: string,
    @Param("resourceId") resourceId: string,
    @Body() body: { extensionId?: string; channel?: string },
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    if (
      body?.channel !== undefined &&
      (typeof body.channel !== "string" || typeof body.extensionId !== "string")
    ) {
      throw new BadRequestException("Invalid presence channel");
    }
    reply.header("Cache-Control", "no-store");
    const principal = await this.access.requireOrganization(session);
    const identity = await this.presence.authorize({
      ...principal,
      workspaceId,
      resourceId,
      sessionId: session.session.id,
      storageId: "",
      kind: body?.channel ? "channel" : "resource",
      extensionId: body?.channel ? body.extensionId : undefined,
      channel: body?.channel,
    });
    return { ticket: await this.relay.issue(identity), user: identity.user };
  }
}
