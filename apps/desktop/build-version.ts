export function formatDesktopBuildVersion(
  env: Record<string, string | undefined>
) {
  return env.LUNARIS_BUILD_VERSION ?? "local";
}
