import { RetrieveApi } from "@app/utils/openapi";
import { Controller } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { log } from "evlog";
import { useLogger } from "evlog/nestjs";
import { EncryptionKeyResponseDto } from "./encryption-key.schema";
import { EncryptionKeyService } from "./encryption-key.service";

@Controller("client")
export class EncryptionKeyController {
  constructor(private readonly encryptionKeyService: EncryptionKeyService) {}

  @RetrieveApi({
    path: "encryption-key",
    serializer: EncryptionKeyResponseDto,
    operation: {
      summary: "Get local DB encryption key",
      description:
        "Returns a 256-bit (hex-encoded) ChaCha20 key derived from the server-held master secret and the current Better Auth session id. Held in memory by the client and passed to PowerSync at DB construction. The key rotates naturally with the session (new login → new session.id → new key).",
    },
  })
  getEncryptionKey(@Session() session: UserSession): EncryptionKeyResponseDto {
    useLogger().set({ user: { id: session.user.id } });
    const key = this.encryptionKeyService.derive(session.session.id);
    log.info({
      context: "EncryptionKeyController",
      message: "derived",
      args: [{ userId: session.user.id }],
    });
    return { key };
  }
}
