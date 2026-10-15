import { readFileSync, writeFileSync } from "node:fs";

// PowerSync 1.26.1 has no configurable HTTP bind address. Keep this patch
// specific and fail closed when upgrading to an incompatible upstream layout.
const path = "/app/modules/module-core/dist/CoreModule.js";
const source = readFileSync(path, "utf8");
const listener = /await server\.listen\(\{\s*host: '0\.0\.0\.0',/g;
if ([...source.matchAll(listener)].length !== 1) {
  throw new Error("PowerSync listener changed; review the AIO loopback patch.");
}
writeFileSync(
  path,
  source.replace(listener, (match) => match.replace("0.0.0.0", "127.0.0.1")),
);
