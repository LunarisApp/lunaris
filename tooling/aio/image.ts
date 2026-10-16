export function imageConfig(app = process.env.IMAGE_APP ?? "aio") {
  if (app !== "aio" && app !== "api" && app !== "web") {
    throw new Error(`Unknown image app: ${app}`);
  }
  return {
    app,
    image: `lunarisapp/lunaris-${app}`,
    prefix: app === "aio" ? "aio-v" : `${app}@`,
  };
}
