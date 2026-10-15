import { ActionApi, RetrieveApi } from "@app/utils/openapi";
import { Body, Controller } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { isSessionAnonymous } from "@repo/auth/session-utils";
import { resolveSyncAccess, SYNC_ACCESS } from "@repo/auth/sync-access";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { EntitlementsService } from "../entitlements";
import {
  LocalOnlySyncAccessError,
  NoActiveOrganizationError,
} from "./sync.errors";
import {
  SyncCredentialsResponseDto,
  SyncRequestDto,
  SyncResponseDto,
} from "./sync.schema";
import { SyncService } from "./sync.service";

/**
 * Response shape for 403 `LocalOnlySyncAccessError`. `reason` is the
 * machine-readable discriminator clients use to show the sign-in UI. Kept as
 * an OpenAPI example so SDK consumers see the field without parsing `why`.
 */
const LOCAL_ONLY_403_RESPONSE = {
  status: 403,
  description: "Cloud sync is not available for anonymous sessions.",
  schema: {
    type: "object",
    properties: {
      statusCode: { type: "number", example: 403 },
      message: {
        type: "string",
        example: "Cloud sync is disabled for this session",
      },
      why: { type: "string" },
      reason: {
        type: "string",
        enum: ["anonymous"],
      },
      timestamp: { type: "string" },
      requestId: { type: "string" },
    },
  },
};

const NO_ORG_400_RESPONSE = {
  status: 400,
  description:
    "Returned when the session has no active organization (rare — missed during signup hook).",
};

@Controller("sync")
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @RetrieveApi({
    path: "credentials",
    serializer: SyncCredentialsResponseDto,
    operation: {
      summary: "Get PowerSync sync credentials",
      description:
        "Returns credentials that can be used by the client app for syncing down the data using PowerSync backend connector. The returned `expiresAt` is set ~60s before the actual JWT expiry (JWT TTL is 5 minutes), so the PowerSync SDK can call `fetchCredentials` again before any in-flight request hits 401.",
    },
  })
  @ApiResponse(NO_ORG_400_RESPONSE)
  @ApiResponse(LOCAL_ONLY_403_RESPONSE)
  async getCredentials(
    @Session() session: UserSession,
  ): Promise<SyncCredentialsResponseDto> {
    const organizationId = requireActiveOrganization(session);
    const log = useLogger();
    log.set({
      user: { id: session.user.id },
      organization: { id: organizationId },
    });
    const syncAccess = await this.assertOrganizationAccess(
      session,
      organizationId,
    );
    return this.syncService.getCredentials(
      session.user.id,
      organizationId,
      syncAccess,
    );
  }

  @ActionApi({
    path: "ingest",
    serializer: SyncResponseDto,
    operation: {
      summary: "Ingest data to the cloud",
      description:
        "Processes a batch of transactions synced up from the client using PowerSync backend connector.",
    },
  })
  @ApiResponse(NO_ORG_400_RESPONSE)
  @ApiResponse(LOCAL_ONLY_403_RESPONSE)
  async ingest(
    @Session() session: UserSession,
    @Body({ schema: SyncRequestDto }) body: SyncRequestDto,
  ): Promise<SyncResponseDto> {
    const organizationId = requireActiveOrganization(session);
    const log = useLogger();
    log.set({
      user: { id: session.user.id },
      organization: { id: organizationId },
      sync: {
        transactions: body.transactions.length,
        entries: body.transactions.reduce((s, t) => s + t.crud.length, 0),
      },
    });
    await this.assertOrganizationAccess(session, organizationId);
    await this.syncService.ingest(
      body.transactions,
      organizationId,
      session.user.id,
    );
    return {};
  }

  /** Authenticated users receive cloud sync, including Free organizations. */
  private assertCloudSync(session: UserSession) {
    const syncAccess = resolveSyncAccess({
      isAnonymous: isSessionAnonymous(session),
    });
    if (syncAccess !== SYNC_ACCESS.cloud) {
      throw new LocalOnlySyncAccessError("anonymous");
    }
    return syncAccess;
  }

  private async assertOrganizationAccess(
    session: UserSession,
    organizationId: string,
  ) {
    const syncAccess = this.assertCloudSync(session);
    await this.entitlements.assertOrganizationMember(
      session.user.id,
      organizationId,
    );
    return syncAccess;
  }
}

function requireActiveOrganization(session: UserSession): string {
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    throw new NoActiveOrganizationError();
  }
  return organizationId;
}
