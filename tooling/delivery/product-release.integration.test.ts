import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lunaris-product-"));
  roots.push(root);
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "artifacts"));
  mkdirSync(join(root, "dist"));
  const sha = "a".repeat(40);
  const candidate = {
    schemaVersion: 1,
    sha,
    runId: "100",
    api: { sha, image: `ghcr.io/example/api@sha256:${"b".repeat(64)}` },
    web: { sha, image: `ghcr.io/example/web@sha256:${"c".repeat(64)}` },
    syncRevision: "d".repeat(64),
    configurationRevision: "1",
  };
  const initial = {
    candidate,
    releases: [] as {
      tag_name: string;
      draft: boolean;
      assets: { name: string }[];
    }[],
    files: {} as Record<string, string>,
    calls: [] as string[],
    tags: ["desktop@0.9.0"],
    reservations: [] as {
      id: number;
      payload: unknown;
      sha: string;
      environment: string;
    }[],
    reservationState: "in_progress",
    failCreate: false,
  };
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(
    join(root, "artifacts/candidate.json"),
    JSON.stringify(candidate)
  );
  writeFileSync(
    join(root, "artifacts/staging.json"),
    JSON.stringify({ deploymentId: 1 })
  );
  writeFileSync(
    join(root, "bin/git"),
    `#!${process.execPath}
import{readFileSync}from'node:fs';const a=process.argv.slice(2);if(a[0]==='rev-parse')console.log('${sha}');else if(a[0]==='tag')console.log(JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8')).tags.join('\\n'));
`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(root, "preload.ts"),
    `import{readFileSync,writeFileSync}from'node:fs';globalThis.fetch=async(input,options={})=>{const s=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));const u=String(input);let v;
if(u.includes('/statuses')){if(options.method==='POST')s.reservationState=JSON.parse(options.body).state;v=[{state:u.includes('/1/')?'success':s.reservationState}];}
else if(u.includes('/deployments?'))v=u.includes('release%2Fproduct')?s.reservations:[];
else if(u.endsWith('/deployments')&&options.method==='POST'){v={id:2,...JSON.parse(options.body)};s.reservations.push(v);}
else if(u.includes('/deployments/1'))v={id:1,environment:'staging/core',payload:s.candidate,sha:s.candidate.sha};else throw new Error('Unexpected fetch '+u);
writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(s));return Response.json(v);};`
  );
  writeFileSync(
    join(root, "bin/gh"),
    `#!${process.execPath}
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
const s=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));const a=process.argv.slice(2);s.calls.push(a.join(' '));let result;
if(a[0]==='api'){
 if(a[1].includes('/releases?'))result=[s.releases];
 else if(a[1].includes('/releases/tags/'))result=s.releases.find(r=>r.tag_name===a[1].split('/').at(-1));
 else if(a[1].includes('/git/ref/tags/')){if(!s.tags.includes(a[1].split('/').at(-1))){console.error('HTTP 404');process.exit(1);}result={object:{type:'commit',sha:s.candidate.sha}};}
 else if(a[1].endsWith('/git/refs'))s.tags.push(a[a.indexOf('-f')+1].split('/').at(-1));
 else throw new Error('Unexpected api '+a[1]);
}else if(a[0]==='release'){
 const tag=a[2];let r=s.releases.find(r=>r.tag_name===tag);
 if(a[1]==='create'&&s.failCreate){console.error('Simulated outage');process.exit(1);}if(a[1]==='create')s.releases.push({tag_name:tag,draft:true,assets:[]});
 else if(a[1]==='upload'){const path=a[3];const name=path.split('/').at(-1);r.assets.push({name});s.files[tag+'/'+name]=readFileSync(path,'utf8');}
 else if(a[1]==='download'){const name=a[a.indexOf('--pattern')+1];const dir=a[a.indexOf('--dir')+1];mkdirSync(dir,{recursive:true});if(!(tag+'/'+name in s.files))throw new Error('Missing asset '+name);writeFileSync(join(dir,name),s.files[tag+'/'+name]);}
 else throw new Error('Unexpected release '+a[1]);
}else throw new Error('Unexpected gh '+a[0]);
writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(s));if(result!==undefined)console.log(JSON.stringify(result));
`,
    { mode: 0o755 }
  );
  return {
    root,
    candidate,
    state: () => JSON.parse(readFileSync(statePath, "utf8")) as typeof initial,
    set: (state: typeof initial) =>
      writeFileSync(statePath, JSON.stringify(state)),
    run: (mode: string, version = "", group = "cli") =>
      spawnSync(
        process.execPath,
        [
          "--preload",
          join(root, "preload.ts"),
          join(import.meta.dir, "product-release.ts"),
          mode,
          "dist",
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${join(root, "bin")}:${process.env.PATH}`,
            FIXTURE_STATE: statePath,
            GITHUB_REPOSITORY: "fixture/repo",
            GH_TOKEN: "fixture",
            PRODUCT_TAG_TOKEN: "fixture",
            PRODUCT_VERSION: version,
            PRODUCT_GROUP: group,
            GITHUB_RUN_ID: "200",
            CORE_CONFIGURATION_REVISION: "1",
            GITHUB_OUTPUT: join(root, "outputs"),
          },
        }
      ),
  };
}
test("stable reservation chooses next version once and resumes without another tag", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  expect(f.state().releases.map((r) => r.tag_name)).toEqual(["v0.9.1"]);
  const result = f.run("reserve");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(
    f.state().calls.filter((c) => c.includes("release create"))
  ).toHaveLength(1);
});
test("unfinished product release rejects another candidate and explicit version", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  expect(f.run("reserve", "1.0.0").stderr).toContain(
    "Finish reserved version first"
  );
  const state = f.state();
  state.candidate.runId = "101";
  f.set(state);
  writeFileSync(
    join(f.root, "artifacts/candidate.json"),
    JSON.stringify(state.candidate)
  );
  expect(f.run("reserve").stderr).toContain("different source");
});
test("artifact publication persists receipt, restores exact bytes, and rejects replacement", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  const name = "lunaris-cli-0.9.1-universal-apple-darwin-adhoc.zip";
  writeFileSync(join(f.root, "dist", name), "original package bytes");
  const result = f.run("upload", "0.9.1");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(f.state().files["v0.9.1/cli-receipt.json"]).toContain(
    createHash("sha256").update("original package bytes").digest("hex")
  );
  writeFileSync(join(f.root, "dist", name), "modified");
  expect(f.run("upload", "0.9.1").stderr).toContain(
    "Existing artifact receipt differs"
  );
  expect(f.run("restore", "0.9.1").status).toBe(0);
  expect(readFileSync(join(f.root, "dist", name), "utf8")).toBe(
    "original package bytes"
  );
});
test("restore rejects corrupt remote bytes", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  const name = "lunaris-cli-0.9.1-universal-apple-darwin.zip";
  writeFileSync(join(f.root, "dist", name), "original");
  expect(f.run("upload", "0.9.1").status).toBe(0);
  const state = f.state();
  state.files[`v0.9.1/${name}`] = "tampered";
  f.set(state);
  expect(f.run("restore", "0.9.1").stderr).toContain("Checksum mismatch");
});

test("reservation survives outage between immutable tag and draft creation", () => {
  const f = fixture();
  const state = f.state();
  state.failCreate = true;
  f.set(state);
  expect(f.run("reserve").status).not.toBe(0);
  expect(f.state().tags).toContain("v0.9.1");
  expect(f.state().reservations).toHaveLength(1);
  const retry = f.state();
  retry.failCreate = false;
  f.set(retry);
  const result = f.run("reserve");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(f.state().releases.map((item) => item.tag_name)).toEqual(["v0.9.1"]);
  expect(f.state().reservations).toHaveLength(1);
});

test("Windows and Linux receipts restore installer bytes independently", () => {
  for (const [group, target, format] of [
    ["desktop-windows", "x86_64-pc-windows-msvc", "exe"],
    ["desktop-linux", "x86_64-unknown-linux-gnu", "deb"],
  ]) {
    const f = fixture();
    expect(f.run("reserve").status).toBe(0);
    const name = `Lunaris-desktop-0.9.1-${target}.${format}`;
    writeFileSync(join(f.root, "dist", name), "installer bytes");
    const result = f.run("upload", "0.9.1", group);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(f.state().files[`v0.9.1/${group}-receipt.json`]).toContain(name);
    writeFileSync(join(f.root, "dist", name), "changed bytes");
    expect(f.run("restore", "0.9.1", group).status).toBe(0);
    expect(readFileSync(join(f.root, "dist", name), "utf8")).toBe(
      "installer bytes"
    );
  }
});
