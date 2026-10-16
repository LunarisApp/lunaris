import { DatabaseService } from "@app/db";
import { StorageConfig, StorageService } from "@app/storage";
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { useLogger } from "evlog/nestjs";
import { user } from "../../auth/auth.entity";

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

@Injectable()
export class AvatarService {
  constructor(
    private readonly storageService: StorageService,
    private readonly db: DatabaseService,
    private readonly storageConfig: StorageConfig
  ) {}

  async getUploadUrl(userId: string, resource: string) {
    useLogger().set({
      avatar: { resource, operation: "create-upload-url" },
      user: { id: userId },
    });
    const ext = CONTENT_TYPE_TO_EXT[resource];
    const key = `avatars/${userId}/${Date.now()}.${ext}`;
    const publicUrl = `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/${key}`;
    const uploadUrl = await this.storageService.getSignedUploadUrl(
      key,
      resource,
      600
    );
    return { uploadUrl, key, publicUrl };
  }

  async confirmUpload(userId: string, key: string) {
    const log = useLogger();
    log.set({
      avatar: { cleanupStatus: "not-needed", operation: "confirm-upload" },
      user: { id: userId },
    });

    if (!key.startsWith(`avatars/${userId}/`)) {
      throw new ForbiddenException("Key does not belong to user");
    }

    const publicUrl = `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/${key}`;

    const [currentUser] = await this.db.db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId));

    await this.db.db
      .update(user)
      .set({ image: publicUrl })
      .where(eq(user.id, userId));

    if (currentUser?.image?.startsWith(this.storageConfig.endpoint)) {
      const oldKey = currentUser.image.replace(
        `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/`,
        ""
      );
      try {
        await this.storageService.deleteObject(oldKey);
        log.set({ avatar: { cleanupStatus: "complete" } });
      } catch (error) {
        log.warn("Old avatar cleanup failed", {
          avatar: {
            cleanupError:
              error instanceof Error ? error.message : String(error),
            cleanupStatus: "failed",
          },
        });
      }
    }

    return { imageUrl: publicUrl };
  }

  async getSignedAvatarUrl(userId: string) {
    useLogger().set({
      avatar: { operation: "get-download-url" },
      user: { id: userId },
    });
    const [result] = await this.db.db
      .select({ image: user.image })
      .from(user)
      .where(eq(user.id, userId));

    if (!result?.image) {
      throw new NotFoundException("No avatar");
    }

    const prefix = `${this.storageConfig.endpoint}/${this.storageConfig.bucket}/`;
    const key = result.image.startsWith(prefix)
      ? result.image.slice(prefix.length)
      : result.image;

    return this.storageService.getSignedDownloadUrl(key, 3600);
  }
}
