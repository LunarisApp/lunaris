const forbidden = [
  "@powersync/web",
  "WASQLiteOpenFactory",
  "WASQLiteDB.worker",
  "SharedSyncImplementation.worker",
  "wa-sqlite",
];
if (process.env.TAURI_ENV_DEBUG !== "true") {
  forbidden.push("http://localhost:", "http://127.0.0.1:");
}
const glob = new Bun.Glob("**/*.{js,mjs,cjs,wasm,map}");

for await (const file of glob.scan({ cwd: "dist", absolute: true })) {
  const name = file.toLowerCase();
  if (
    name.includes("wa-sqlite") ||
    (name.includes("powersync") && name.includes("worker"))
  ) {
    throw new Error(`Desktop build contains web PowerSync artifact: ${file}`);
  }
  if (file.endsWith(".wasm")) continue;
  const source = await Bun.file(file).text();
  const match = forbidden.find((value) => source.includes(value));
  if (match) throw new Error(`Desktop build contains ${match}: ${file}`);
}
