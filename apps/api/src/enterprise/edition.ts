import { enterpriseTeams } from "@repo/ee-teams/server";
import { AuditModule } from "./audit.module";

export const editionModules = [AuditModule];
export const organizationTeams = enterpriseTeams;
