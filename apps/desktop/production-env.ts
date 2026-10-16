const DIRECTORY_PATH = "/.well-known/lunaris-regions";

function invalidProductionEnvironment(message: string): never {
  throw new Error(`Invalid desktop production environment: ${message}`);
}

export function validateDesktopProductionEnv(
  env: Record<string, string | undefined>
) {
  const value = env.VITE_REGION_DIRECTORY_URL;
  if (!value) {
    return;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidProductionEnvironment("region directory URL is invalid");
  }

  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== DIRECTORY_PATH ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.hostname !== "lunaris.app" && !url.hostname.endsWith(".lunaris.app"))
  ) {
    invalidProductionEnvironment(
      "region directory must use HTTPS on a Lunaris domain"
    );
  }
}
