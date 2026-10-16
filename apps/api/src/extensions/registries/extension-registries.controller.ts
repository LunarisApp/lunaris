import {
  CreateApi,
  DeleteApi,
  RetrieveApi,
  UpdateApi,
} from "@app/utils/openapi";
import { Body, Controller, ForbiddenException, Param } from "@nestjs/common";
import { permission } from "@repo/auth/permissions";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { useLogger } from "evlog/nestjs";
import { AuditActions } from "../../audit/recording/audit.actions";
import { recordComplianceAudit } from "../../audit/recording/audit-log";
import { RequirePermission } from "../../security/permissions/permission.decorator";
import { UserDataAccessService } from "../../workspaces/core/user-data-access.service";
import {
  AddOrganizationExtensionRegistryDto,
  OrganizationDeveloperModeDto,
  OrganizationExtensionRegistryDto,
  OrganizationExtensionRegistryListDto,
  OrganizationExtensionRegistryParamsDto,
} from "./extension-registries.schema";
import { ExtensionRegistriesService } from "./extension-registries.service";

@Controller("organizations/:organizationId/extension-registries")
@RequirePermission(permission.organization.update)
export class ExtensionRegistriesController {
  constructor(
    private readonly access: UserDataAccessService,
    private readonly registries: ExtensionRegistriesService
  ) {}

  @RetrieveApi({
    path: "developer-mode",
    serializer: OrganizationDeveloperModeDto,
    operation: { summary: "Read organization developer mode" },
  })
  async getDeveloperMode(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string
  ) {
    const organization = await this.requireOrganization(
      session,
      organizationId
    );
    return this.registries.getDeveloperMode(organization.organizationId);
  }

  @UpdateApi({
    path: "developer-mode",
    serializer: OrganizationDeveloperModeDto,
    operation: { summary: "Update organization developer mode" },
  })
  async setDeveloperMode(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Body({ schema: OrganizationDeveloperModeDto })
    body: OrganizationDeveloperModeDto
  ) {
    const organization = await this.requireOrganization(
      session,
      organizationId
    );
    await this.registries.requireOwner(
      organization.organizationId,
      organization.userId
    );
    const result = await this.registries.setDeveloperMode(
      organization.organizationId,
      body.enabled
    );
    recordComplianceAudit(
      useLogger(),
      AuditActions.organizationUpdated({
        actor: { id: organization.userId, type: "user" },
        changes: { after: { developerMode: result.enabled } },
        outcome: "success",
        target: {
          id: organization.organizationId,
          tenantId: organization.organizationId,
        },
      })
    );
    return result;
  }

  @RetrieveApi({
    serializer: OrganizationExtensionRegistryListDto,
    operation: { summary: "List organization extension marketplaces" },
  })
  async list(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string
  ): Promise<OrganizationExtensionRegistryDto[]> {
    const organization = await this.requireOrganization(
      session,
      organizationId
    );
    return this.registries.list(organization.organizationId);
  }

  @CreateApi({
    serializer: OrganizationExtensionRegistryDto,
    operation: { summary: "Add a public extension marketplace" },
  })
  async add(
    @Session() session: UserSession,
    @Param("organizationId") organizationId: string,
    @Body({ schema: AddOrganizationExtensionRegistryDto })
    body: AddOrganizationExtensionRegistryDto
  ): Promise<OrganizationExtensionRegistryDto> {
    const organization = await this.requireOrganization(
      session,
      organizationId
    );
    await this.registries.requireOwner(
      organization.organizationId,
      organization.userId
    );
    const registry = await this.registries.add(
      organization.organizationId,
      body.url,
      organization.userId
    );
    recordComplianceAudit(
      useLogger(),
      AuditActions.organizationExtensionRegistryAdded({
        actor: { id: organization.userId, type: "user" },
        changes: { after: registry },
        outcome: "success",
        target: { id: registry.id, tenantId: organization.organizationId },
      })
    );
    return registry;
  }

  @DeleteApi({
    path: ":registryId",
    operation: { summary: "Remove an organization extension marketplace" },
  })
  async remove(
    @Session() session: UserSession,
    @Param({ schema: OrganizationExtensionRegistryParamsDto })
    params: OrganizationExtensionRegistryParamsDto
  ): Promise<{ registryId: string }> {
    const organization = await this.requireOrganization(
      session,
      params.organizationId
    );
    await this.registries.requireOwner(
      organization.organizationId,
      organization.userId
    );
    const result = await this.registries.remove(
      organization.organizationId,
      params.registryId
    );
    recordComplianceAudit(
      useLogger(),
      AuditActions.organizationExtensionRegistryRemoved({
        actor: { id: organization.userId, type: "user" },
        changes: { before: { registryId: result.registryId } },
        outcome: "success",
        target: {
          id: result.registryId,
          tenantId: organization.organizationId,
        },
      })
    );
    return result;
  }

  private async requireOrganization(
    session: UserSession,
    organizationId: string
  ) {
    const organization = await this.access.requireOrganization(session);
    if (organization.organizationId !== organizationId) {
      throw new ForbiddenException(
        "Organization marketplace management is unavailable"
      );
    }
    return organization;
  }
}
