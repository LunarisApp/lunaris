import { DatabaseService } from "@app/db";
import { decodeCursor, toPage } from "@app/utils/pagination";
import { Injectable } from "@nestjs/common";
import { AuditService as EnterpriseAuditService } from "@repo/ee-audit/server";
import { and, eq } from "drizzle-orm";
import { member } from "../auth/auth.entity";
import {
  flushLogDrain,
  registerAuditDrain,
  unregisterAuditDrain,
} from "../instrument";

/** Nest adapter; compliance implementation lives in @repo/ee-audit/server. */
@Injectable()
export class AuditService extends EnterpriseAuditService {
  constructor(database: DatabaseService) {
    super({
      db: database.db,
      decodeCursor,
      toPage,
      flushLogDrain,
      registerAuditDrain,
      unregisterAuditDrain,
      getMemberRole: async (userId, tenantId) => {
        const [membership] = await database.db
          .select({ role: member.role })
          .from(member)
          .where(
            and(eq(member.userId, userId), eq(member.organizationId, tenantId))
          )
          .limit(1);
        return membership?.role;
      },
    });
  }
}
