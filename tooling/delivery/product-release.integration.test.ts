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
import { desktopAssetNames } from "./desktop-updater";

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
    reservationStates: {} as Record<string, string>,
    failCreate: false,
    productionReady: false,
  };
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify(initial));
  writeFileSync(
    join(root, "artifacts/candidate.json"),
    JSON.stringify(candidate)
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
if(u.includes('/statuses')){const id=u.split('/deployments/')[1].split('/')[0];if(options.method==='POST'){s.reservationState=JSON.parse(options.body).state;s.reservationStates[id]=s.reservationState;}v=[{state:id==='1'||id==='999'?'success':s.reservationStates[id]??s.reservationState}];}
else if(u.includes('/deployments?'))v=u.includes('release%2Fproduct')?s.reservations:s.productionReady?[{id:999,environment:'production/core',payload:s.candidate,sha:s.candidate.sha}]:[];
else if(u.endsWith('/deployments')&&options.method==='POST'){v={id:s.reservations.length+2,...JSON.parse(options.body)};s.reservations.push(v);}
else throw new Error('Unexpected fetch '+u);
writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(s));return Response.json(v);};`
  );
  writeFileSync(
    join(root, "bin/gh"),
    `#!${process.execPath}
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
const s=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));const a=process.argv.slice(2);s.calls.push(a.join(' '));let result;
if(a[0]==='api'){
 if(a[1].includes('/releases?'))result=[s.releases];
 else if(a[1].includes('/releases/tags/')){const r=s.releases.find(r=>r.tag_name===a[1].split('/').at(-1));if(!r||r.draft){console.error('HTTP 404');process.exit(1);}result=r;}
 else if(a[1].includes('/git/ref/tags/')){if(!s.tags.includes(a[1].split('/').at(-1))){console.error('HTTP 404');process.exit(1);}result={object:{type:'commit',sha:s.candidate.sha}};}
 else if(a[1].endsWith('/git/refs'))s.tags.push(a[a.indexOf('-f')+1].split('/').at(-1));
 else throw new Error('Unexpected api '+a[1]);
}else if(a[0]==='release'){
 const tag=a[2];let r=s.releases.find(r=>r.tag_name===tag);
 if(a[1]==='view'){if(!r)throw new Error('Missing release '+tag);result={assets:r.assets,isDraft:r.draft,tagName:r.tag_name};}
 else if(a[1]==='delete'){if(!r||!r.draft||r.assets.length)throw new Error('Cannot delete populated release');s.releases.splice(s.releases.indexOf(r),1);}
 else if(a[1]==='create'&&s.failCreate){console.error('Simulated outage');process.exit(1);}else if(a[1]==='create')s.releases.push({tag_name:tag,draft:true,assets:[]});
 else if(a[1]==='edit')r.draft=false;
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
test("legacy reservations resume without staging receipts or live staging", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  const state = f.state();
  const reservation = state.reservations[0]!;
  const legacy = { ...(reservation.payload as object), stagingDeploymentId: 1 };
  reservation.payload = legacy;
  state.files["v0.9.1/release-plan.json"] =
    `${JSON.stringify(legacy, null, 2)}\n`;
  f.set(state);
  const result = f.run("reserve");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(f.state().reservations).toHaveLength(1);
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
test("stable reservation ignores independent package and legacy artifact drafts", () => {
  const f = fixture();
  const state = f.state();
  const tags = [
    "@lunarisapp/ui@0.0.8",
    "@lunarisapp/plugin-sdk@0.12.5",
    "desktop@0.9.0",
  ];
  state.releases = tags.map((tag_name) => ({
    tag_name,
    draft: true,
    assets: [],
  }));
  f.set(state);
  const result = f.run("reserve");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(f.state().releases.map((r) => r.tag_name)).toEqual([
    ...tags,
    "v0.9.1",
  ]);
  expect(f.run("reserve").status).toBe(0);
  expect(f.state().reservations).toHaveLength(1);
  expect(
    f.state().calls.some((call) => call.startsWith("release delete"))
  ).toBe(false);
});
test("new candidate retires empty reservation after initial plan upload failed", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  const state = f.state();
  state.releases[0]!.assets = [];
  delete state.files["v0.9.1/release-plan.json"];
  state.candidate.runId = "101";
  f.set(state);
  writeFileSync(
    join(f.root, "artifacts/candidate.json"),
    JSON.stringify(state.candidate)
  );
  const result = f.run("reserve");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(f.state().tags).toContain("v0.9.1");
  expect(f.state().releases.map((r) => r.tag_name)).toEqual(["v0.9.2"]);
  expect(f.state().reservationStates["2"]).toBe("inactive");
  expect(f.state().reservations).toHaveLength(2);
  expect(f.run("reserve").status).toBe(0);
  expect(f.state().reservations).toHaveLength(2);
});
test("new candidate cannot retire a draft with partial artifacts or a published release", () => {
  for (const draft of [true, false]) {
    const f = fixture();
    expect(f.run("reserve").status).toBe(0);
    const state = f.state();
    state.releases[0]!.draft = draft;
    state.releases[0]!.assets = draft ? [{ name: "partial.zip" }] : [];
    state.candidate.runId = "101";
    f.set(state);
    writeFileSync(
      join(f.root, "artifacts/candidate.json"),
      JSON.stringify(state.candidate)
    );
    expect(f.run("reserve").stderr).toContain("different source");
    expect(
      f.state().calls.some((call) => call.startsWith("release delete"))
    ).toBe(false);
    expect(f.state().reservations).toHaveLength(1);
  }
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
    const updater = desktopAssetNames(
      "0.9.1",
      group as "desktop-windows" | "desktop-linux"
    );
    if (updater.update !== name) {
      writeFileSync(join(f.root, "dist", updater.update), "update bytes");
    }
    writeFileSync(join(f.root, "dist", updater.signature), "signature bytes");
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

test("finalization publishes complete updater metadata before making the release live", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  const groups = [
    "cli",
    "desktop",
    "desktop-windows",
    "desktop-linux",
    "self-hosted",
  ] as const;
  for (const group of groups) {
    rmSync(join(f.root, "dist"), { recursive: true });
    mkdirSync(join(f.root, "dist"));
    const names =
      group === "cli"
        ? ["lunaris-cli-0.9.1-universal-apple-darwin.zip"]
        : group === "self-hosted"
          ? ["install.sh", "lunaris-self-hosted-0.9.1.tar.gz"]
          : [...new Set(Object.values(desktopAssetNames("0.9.1", group)))];
    for (const name of names) {
      writeFileSync(join(f.root, "dist", name), `fixture ${name}`);
    }
    const result = f.run("upload", "0.9.1", group);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  }
  const state = f.state();
  state.productionReady = true;
  f.set(state);
  const result = f.run("finalize", "0.9.1");
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const published = f.state();
  const feed = JSON.parse(published.files["v0.9.1/desktop-updater.json"]!);
  expect(feed.version).toBe("0.9.1");
  expect(Object.keys(feed.platforms)).toHaveLength(4);
  expect(feed.platforms["linux-x86_64"].url).toEndWith(".AppImage");
  expect(published.files["v0.9.1/SHA256SUMS"]).toContain(
    "desktop-updater.json"
  );
  expect(published.releases[0]!.draft).toBe(false);
  const feedUpload = published.calls.findIndex(
    (call) =>
      call.startsWith("release upload") && call.endsWith("desktop-updater.json")
  );
  const publication = published.calls.findIndex((call) =>
    call.startsWith("release edit")
  );
  expect(feedUpload).toBeGreaterThan(-1);
  expect(feedUpload).toBeLessThan(publication);
});

test("new desktop uploads fail closed without updater signatures", () => {
  const f = fixture();
  expect(f.run("reserve").status).toBe(0);
  writeFileSync(
    join(f.root, "dist/Lunaris-desktop-0.9.1-universal.dmg"),
    "installer"
  );
  expect(f.run("upload", "0.9.1", "desktop").stderr).toContain(
    "New desktop releases require signed updater assets"
  );
  expect(
    f
      .state()
      .releases[0]!.assets.some(
        (asset) => asset.name === "desktop-receipt.json"
      )
  ).toBe(false);
});

test.each([false, true])(
  "legacy reservations finish without a partial update feed (mixed: %s)",
  (mixed) => {
    const f = fixture();
    expect(f.run("reserve").status).toBe(0);
    const state = f.state();
    for (const group of [
      "cli",
      "desktop",
      "desktop-windows",
      "desktop-linux",
      "self-hosted",
    ] as const) {
      const names =
        group === "cli"
          ? ["lunaris-cli-0.9.1-universal-apple-darwin.zip"]
          : group === "self-hosted"
            ? ["install.sh", "lunaris-self-hosted-0.9.1.tar.gz"]
            : mixed && group !== "desktop"
              ? [...new Set(Object.values(desktopAssetNames("0.9.1", group)))]
              : [desktopAssetNames("0.9.1", group).installer];
      const assets = names.map((name) => {
        const content = `fixture ${name}`;
        state.files[`v0.9.1/${name}`] = content;
        state.releases[0]!.assets.push({ name });
        return {
          name,
          sha256: createHash("sha256").update(content).digest("hex"),
        };
      });
      const receiptName = `${group}-receipt.json`;
      state.files[`v0.9.1/${receiptName}`] = `${JSON.stringify(
        {
          schemaVersion: 1,
          version: "0.9.1",
          sourceCommit: f.candidate.sha,
          producerRunId: "100",
          group,
          assets,
        },
        null,
        2
      )}\n`;
      state.releases[0]!.assets.push({ name: receiptName });
    }
    state.productionReady = true;
    f.set(state);
    expect(f.run("restore", "0.9.1", "desktop").status).toBe(0);
    const upload = f.run("upload", "0.9.1", "desktop");
    expect(upload.stderr).toBe("");
    expect(upload.status).toBe(0);
    const result = f.run("finalize", "0.9.1");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(f.state().releases[0]!.draft).toBe(false);
    expect(f.state().files["v0.9.1/desktop-updater.json"]).toBeUndefined();
    expect(f.state().files["v0.9.1/SHA256SUMS"]).not.toContain(
      "desktop-updater.json"
    );
  },
  20_000
);
