import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PermissionGuard } from "./permission.guard";
import { PermissionService } from "./permission.service";

@Global()
@Module({
  providers: [
    PermissionService,
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  exports: [PermissionService],
})
export class PermissionModule {}
