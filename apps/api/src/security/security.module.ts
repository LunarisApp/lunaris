import { Module } from "@nestjs/common";
import { EncryptionKeyModule } from "./encryption-key/encryption-key.module";
import { PermissionModule } from "./permissions/permission.module";

@Module({
  imports: [EncryptionKeyModule, PermissionModule],
  exports: [PermissionModule],
})
export class SecurityModule {}
