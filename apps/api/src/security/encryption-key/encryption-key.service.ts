import { hkdfSync } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AppConfig } from "../../app.config";

/**
 * Domain separator for the local-DB encryption key derivation. Bump the
 * version suffix if the derivation inputs or algorithm ever change so old
 * keys can never collide with new ones.
 */
const HKDF_SALT = "lunaris-powersync-v1";
const HKDF_LENGTH_BYTES = 32;

@Injectable()
export class EncryptionKeyService {
  constructor(private readonly appConfig: AppConfig) {}

  /**
   * Derive a 256-bit ChaCha20 key for the client's local PowerSync DB from
   * the server-held master secret and the Better Auth session id.
   *
   * Stateless by design: the master secret lives only in the env/KMS, never
   * the DB — so a DB dump alone cannot derive any user's key. Rotation of
   * the master secret forces every client to re-sync (existing local DB
   * files become unreadable).
   */
  derive(sessionId: string): string {
    const master = Buffer.from(this.appConfig.localDbEncryptionMasterKey, "hex");
    const keyBytes = hkdfSync(
      "sha256",
      master,
      Buffer.from(HKDF_SALT),
      Buffer.from(sessionId),
      HKDF_LENGTH_BYTES
    );
    return Buffer.from(keyBytes).toString("hex");
  }
}
