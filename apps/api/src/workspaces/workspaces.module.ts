import { Module } from "@nestjs/common";
import { EntitlementsModule } from "../entitlements";
import { FilesModule } from "../files/files.module";
import { YjsDocumentsService } from "../yjs/yjs-documents.service";
import { UserDataAccessService } from "./core/user-data-access.service";
import { WorkspacesController } from "./core/workspaces.controller";
import { WorkspacesService } from "./core/workspaces.service";
import { WorkspaceMembersController } from "./members/workspace-members.controller";
import { WorkspaceMembersService } from "./members/workspace-members.service";
import { WorkspaceResourceTrashWorker } from "./resources/workspace-resource-trash.worker";
import { WorkspaceResourcesController } from "./resources/workspace-resources.controller";
import { WorkspaceResourcesService } from "./resources/workspace-resources.service";

@Module({
  imports: [EntitlementsModule, FilesModule],
  controllers: [
    WorkspacesController,
    WorkspaceResourcesController,
    WorkspaceMembersController,
  ],
  providers: [
    UserDataAccessService,
    WorkspacesService,
    WorkspaceResourcesService,
    WorkspaceResourceTrashWorker,
    WorkspaceMembersService,
    YjsDocumentsService,
  ],
  exports: [
    UserDataAccessService,
    WorkspacesService,
    WorkspaceResourcesService,
    YjsDocumentsService,
  ],
})
export class WorkspacesModule {}
