import { Module } from "@nestjs/common";
import { EncryptionKeyController } from "./encryption-key.controller";
import { EncryptionKeyService } from "./encryption-key.service";

@Module({
  controllers: [EncryptionKeyController],
  providers: [EncryptionKeyService],
})
export class EncryptionKeyModule {}
