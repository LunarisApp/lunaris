import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
  const root = mkdtempSync(join(tmpdir(), "lunaris-settings-"));
  roots.push(root);
  mkdirSync(join(root, "bin"));
  const state = {
    metadata: { default_branch: "next", allow_merge_commit: true },
    variables: [
      { name: "DELIVERY_MODE", value: "cutover" },
      { name: "RELEASE_APP_ID", value: "123" },
      { name: "CORE_CONFIGURATION_REVISION", value: "1" },
    ],
    rules: [
      {
        id: 11,
        name: "Release next - PRs",
        enforcement: "active",
        source: "fixture/repo",
      },
    ],
    environments: ["production", "staging", "release"].map((name) => ({
      name,
      protection_rules: [],
      deployment_branch_policy: {
        custom_branch_policies: true,
        protected_branches: false,
      },
    })),
    secrets: [
      "RELEASE_APP_PRIVATE_KEY",
      "RAILWAY_RELEASE_TOKEN",
      "RELEASES_S3_ACCESS_KEY_ID",
      "RELEASES_S3_SECRET_ACCESS_KEY",
      "RELEASES_S3_REGION",
      "RELEASES_S3_BUCKET",
      "HOMEBREW_TAP_TOKEN",
    ].map((name) => ({ name })),
    policies: Object.fromEntries(
      ["production", "staging", "release"].map((name) => [
        name,
        [{ id: 1, name: "next", type: "branch" }],
      ])
    ),
    prs: [
      {
        number: 1,
        title: "Feature",
        head: { ref: "feature" },
        base: { ref: "next" },
      },
    ],
    calls: [] as string[],
    failPath: "none",
  };
  const statePath = join(root, "state.json");
  writeFileSync(statePath, JSON.stringify(state));
  writeFileSync(
    join(root, "bin/git"),
    `#!/bin/sh
case "$1" in
rev-parse) printf '%040d\\n' 1;;
show) echo 'name: Release Stable';;
esac
`,
    { mode: 0o755 }
  );
  writeFileSync(
    join(root, "bin/gh"),
    `#!${process.execPath}
import {readFileSync,writeFileSync} from 'node:fs';
const s=JSON.parse(readFileSync(process.env.FIXTURE_STATE,'utf8'));
const a=process.argv.slice(2); const p=(a[1]||'').replace('repos/fixture/repo/','').replace('repos/fixture/repo','').split('?')[0];
const method=a.includes('--method')?a[a.indexOf('--method')+1]:'GET';
const body=a.includes('--input')?JSON.parse(readFileSync(0,'utf8')):{};
let result;
if(a[0]==='variable'){s.variables.find(v=>v.name==='DELIVERY_MODE').value=a.at(-1); s.calls.push('mode:'+a.at(-1));}
else if(method!=='GET'){
 s.calls.push(method+':'+p);
 if(s.failPath===p){writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(s));process.exit(1);}
 if(!p)Object.assign(s.metadata,body);
 else if(p==='rulesets')s.rules.push({...body,id:s.rules.length+100});
 else if(p.startsWith('rulesets/')){const id=Number(p.split('/')[1]);if(method==='DELETE')s.rules=s.rules.filter(r=>r.id!==id);else Object.assign(s.rules.find(r=>r.id===id),body);}
 else if(p.startsWith('pulls/'))s.prs[0].base.ref=body.base;
 else if(p.startsWith('environments/')){const [,name,,id]=p.split('/');if(p.includes('deployment-branch-policies')){if(method==='DELETE')s.policies[name]=s.policies[name].filter(r=>r.id!==Number(id));else s.policies[name].push({...body,id:2});}}
}else{
 if(!p)result=s.metadata;
 else if(p==='actions/variables')result={variables:s.variables};
 else if(p==='rulesets')result=s.rules;
 else if(p.startsWith('rulesets/'))result=s.rules.find(r=>r.id===Number(p.split('/')[1]));
 else if(p==='environments')result={environments:s.environments};
 else if(p.startsWith('environments/')){const [,name,kind]=p.split('/');result=kind==='variables'?{variables:['RAILWAY_RELEASE_TARGETS','RAILWAY_STAGING_TARGETS',...['PROJECT_ID','ENVIRONMENT_ID','API_SERVICE_ID','COMPACT_SERVICE_ID','REPLICATION_SERVICE_ID'].map(k=>'STAGING_POWERSYNC_'+k)].map(name=>({name,value:'not-snapshotted'}))}:kind==='secrets'?{secrets:s.secrets}:kind==='deployment-branch-policies'?{branch_policies:s.policies[name]}:s.environments.find(e=>e.name===name);}
 else if(p==='pulls')result=s.prs;
 else if(p==='actions/permissions')result={enabled:true,allowed_actions:'selected'};
 else if(p==='actions/permissions/workflow')result={default_workflow_permissions:'read',can_approve_pull_request_reviews:true};
 else if(p==='actions/secrets')result={secrets:s.secrets};
 else if(p==='actions/runs')result={total_count:0,workflow_runs:[]};
 else if(p==='releases')result=[];
 else if(p==='actions/variables/DELIVERY_MODE')result=s.variables.find(v=>v.name==='DELIVERY_MODE');
 else throw new Error('Unexpected '+p);
 if(a.includes('--slurp')) result=[Array.isArray(result)?[]:{...result,...(result.variables?{variables:[]}:result.environments?{environments:[]}:result.secrets?{secrets:[]}:result.branch_policies?{branch_policies:[]}:result.workflow_runs?{workflow_runs:[]}: {})},result];
}
writeFileSync(process.env.FIXTURE_STATE,JSON.stringify(s));
if(result!==undefined)console.log(JSON.stringify(result));
`,
    { mode: 0o755 }
  );
  return {
    root,
    state: () => JSON.parse(readFileSync(statePath, "utf8")) as typeof state,
    set: (value: typeof state) =>
      writeFileSync(statePath, JSON.stringify(value)),
    run: (apply = false) =>
      spawnSync(
        process.execPath,
        [join(import.meta.dir, "cutover.ts"), ...(apply ? ["--apply"] : [])],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${join(root, "bin")}:${process.env.PATH}`,
            GITHUB_REPOSITORY: "fixture/repo",
            RELEASE_MAINTAINER_TEAM_ID: "456",
            RELEASE_REHEARSAL_VERIFIED: "true",
            FIXTURE_STATE: statePath,
          },
        }
      ),
  };
}
test("preview snapshots paginated settings without values or mutations", () => {
  const f = fixture();
  const result = f.run();
  expect(result.status).toBe(0);
  expect(f.state().calls).toEqual([]);
  const snapshot = readFileSync(
    join(f.root, ".context/release-cutover/before.json"),
    "utf8"
  );
  expect(snapshot).toContain('"RELEASES_S3_SECRET_ACCESS_KEY"');
  expect(snapshot).not.toContain("not-snapshotted");
});
test("missing prerequisites leave publication disabled before any settings writes", () => {
  const f = fixture();
  const state = f.state();
  state.environments = state.environments.filter((e) => e.name !== "staging");
  f.set(state);
  const result = f.run(true);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Missing GitHub environment staging");
  expect(f.state().calls).toEqual(["mode:cutover"]);
});
test("interrupted migration resumes with original snapshot and enables only after readback", () => {
  const f = fixture();
  const state = f.state();
  state.failPath = "none";
  // Interrupt the first ruleset creation.
  state.failPath = "rulesets";
  f.set(state);
  expect(f.run(true).status).not.toBe(0);
  const snapshot = readFileSync(
    join(f.root, ".context/release-cutover/before.json"),
    "utf8"
  );
  const next = f.state();
  next.failPath = "none";
  f.set(next);
  const result = f.run(true);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(
    readFileSync(join(f.root, ".context/release-cutover/before.json"), "utf8")
  ).toBe(snapshot);
  expect(f.state().metadata.default_branch).toBe("main");
  expect(
    f.state().rules.filter((r) => r.name === "Release main - PRs")
  ).toHaveLength(1);
  expect(f.state().calls.at(-1)).toBe("mode:trunk");
});
