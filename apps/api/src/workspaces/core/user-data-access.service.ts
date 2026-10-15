import { Injectable } from "@nestjs/common";
import { isSessionAnonymous } from "@repo/auth/session-utils";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { EntitlementsService } from "../../entitlements";
import {
  LocalOnlySyncAccessError,
  NoActiveOrganizationError,
} from "../../sync/sync.errors";

export interface UserDataOrganization {
  organizationId: string;
  userId: string;
}

@Injectable()
export class UserDataAccessService {
  constructor(private readonly entitlements: EntitlementsService) {}

  async requireOrganization(session: UserSession): Promise<UserDataOrganization> {
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new NoActiveOrganizationError();
    if (isSessionAnonymous(session)) {
      throw new LocalOnlySyncAccessError("anonymous");
    }

    await this.entitlements.assertOrganizationMember(
      session.user.id,
      organizationId,
    );
    useLogger().set({
      organization: { id: organizationId },
      user: { id: session.user.id },
    });
    return { organizationId, userId: session.user.id };
  }

  async requireOrganizationId(
    session: UserSession,
    organizationId: string,
  ): Promise<UserDataOrganization> {
    if (isSessionAnonymous(session)) {
      throw new LocalOnlySyncAccessError("anonymous");
    }
    await this.entitlements.assertOrganizationMember(
      session.user.id,
      organizationId,
    );
    useLogger().set({
      organization: { id: organizationId },
      user: { id: session.user.id },
    });
    return { organizationId, userId: session.user.id };
  }
}
