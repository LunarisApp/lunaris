import type { ManifestResponseDto } from "./manifest.schema";

export function buildManifest(params: {
  appRegion: string;
  apiUrl: string;
  displayName?: string;
  syncUrl: string;
  storageUrl: string;
  signupsAllowed?: boolean;
  passwordResetEmail?: boolean;
  socialProviders?: "google"[];
}): ManifestResponseDto {
  return {
    auth: "oauth",
    capabilities: { passwordResetEmail: params.passwordResetEmail ?? false },
    signupsAllowed: params.signupsAllowed ?? true,
    socialProviders: params.socialProviders ?? [],
    apiUrl: params.apiUrl,
    displayName:
      params.displayName ?? `Lunaris ${params.appRegion.toUpperCase()}`,
    schemaVersion: 1,
    serverId: params.appRegion,
    syncUrl: params.syncUrl,
    regionId: params.appRegion,
    storageUrl: params.storageUrl,
  };
}
