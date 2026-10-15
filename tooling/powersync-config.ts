import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument, type ScalarTag } from "yaml";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const serviceConfigPath = path.join(
  repositoryRoot,
  "infra/local/config/powersync.yaml"
);
const syncRulesPath = path.join(
  repositoryRoot,
  "infra/local/config/sync_rules.yaml"
);
const syncRulesPathBlock = `sync_rules:
  path: sync_rules.yaml`;

function requiredVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function readProductionTarget() {
  return {
    apiServiceId: requiredVariable("POWERSYNC_API_SERVICE_ID"),
    compactServiceId: requiredVariable("POWERSYNC_COMPACT_SERVICE_ID"),
    environmentId: requiredVariable("POWERSYNC_ENVIRONMENT_ID"),
    projectId: requiredVariable("POWERSYNC_PROJECT_ID"),
    replicationServiceId: requiredVariable("POWERSYNC_REPLICATION_SERVICE_ID"),
  };
}

type ProductionTarget = ReturnType<typeof readProductionTarget>;

interface RailwayDeployment {
  id: string;
  status: string;
}

interface RailwayVariables {
  POWERSYNC_CONFIG_B64?: string;
}

const envTag: ScalarTag = {
  identify: (value) => typeof value === "string",
  resolve: (value) => value,
  tag: "!env",
};

async function renderConfig(): Promise<string> {
  const [serviceConfig, syncRules] = await Promise.all([
    readFile(serviceConfigPath, "utf8"),
    readFile(syncRulesPath, "utf8"),
  ]);
  const markerCount = serviceConfig.split(syncRulesPathBlock).length - 1;

  if (markerCount !== 1) {
    throw new Error(
      `Expected one "${syncRulesPathBlock}" block in ${serviceConfigPath}, found ${markerCount}.`
    );
  }

  const indentedRules = syncRules
    .trimEnd()
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

  return `${serviceConfig
    .trimEnd()
    .replace(
      syncRulesPathBlock,
      `sync_rules:
  content: |
${indentedRules}`
    )}\n`;
}

function encodeConfig(config: string): string {
  return Buffer.from(config).toString("base64");
}

function renderApiConfig(config: string): string {
  return `api:
  tokens:
    - !env PS_ADMIN_TOKEN
${config}`;
}

async function validateConfigs(
  renderedConfig: string,
  renderedApiConfig: string
): Promise<void> {
  const [serviceConfig, syncRules] = await Promise.all([
    readFile(serviceConfigPath, "utf8"),
    readFile(syncRulesPath, "utf8"),
  ]);
  const configs = [
    ["PowerSync service config", serviceConfig],
    ["PowerSync sync rules", syncRules],
    ["rendered PowerSync config", renderedConfig],
    ["rendered PowerSync API config", renderedApiConfig],
  ] as const;

  for (const [name, config] of configs) {
    const document = parseDocument(config, {
      customTags: [envTag],
      prettyErrors: true,
    });

    if (document.errors.length > 0) {
      throw new Error(
        `${name} is invalid:\n${document.errors.map(({ message }) => message).join("\n")}`
      );
    }
  }

  console.log("PowerSync configs are valid YAML and render successfully.");
}

async function runRailway(args: string[], stdin?: string): Promise<string> {
  const childProcess = Bun.spawn(["railway", ...args], {
    cwd: repositoryRoot,
    env: process.env,
    stderr: "pipe",
    stdin: stdin === undefined ? undefined : new Blob([stdin]),
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text(),
    new Response(childProcess.stdout).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`railway ${args.join(" ")} failed:\n${stderr}${stdout}`);
  }

  return stdout;
}

async function readProductionConfig(
  production: ProductionTarget,
  serviceId: string
): Promise<string> {
  const output = await runRailway([
    "variable",
    "list",
    "--project",
    production.projectId,
    "--environment",
    production.environmentId,
    "--service",
    serviceId,
    "--json",
  ]);
  const variables = JSON.parse(output) as RailwayVariables;

  if (!variables.POWERSYNC_CONFIG_B64) {
    throw new Error("Production POWERSYNC_CONFIG_B64 is missing.");
  }

  return variables.POWERSYNC_CONFIG_B64;
}

async function readLatestDeployment(
  production: ProductionTarget,
  serviceId: string
): Promise<RailwayDeployment> {
  const output = await runRailway([
    "deployment",
    "list",
    "--project",
    production.projectId,
    "--environment",
    production.environmentId,
    "--service",
    serviceId,
    "--limit",
    "1",
    "--json",
  ]);
  const deployments = JSON.parse(output) as RailwayDeployment[];
  const deployment = deployments[0];

  if (!deployment) {
    throw new Error(`No Railway deployment found for service ${serviceId}.`);
  }

  return deployment;
}

async function checkProduction(
  production: ProductionTarget,
  expectedShared: string,
  expectedApi: string,
  attempts = 1
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const [actualReplication, actualCompact, actualApi] = await Promise.all([
      readProductionConfig(production, production.replicationServiceId),
      readProductionConfig(production, production.compactServiceId),
      readProductionConfig(production, production.apiServiceId),
    ]);

    if (
      actualReplication === expectedShared &&
      actualCompact === expectedShared &&
      actualApi === expectedApi
    ) {
      console.log("Production PowerSync config matches local config.");
      return;
    }

    if (attempt < attempts) {
      await Bun.sleep(1000);
    }
  }

  throw new Error(
    "Production PowerSync config differs. Run `bun run powersync:config:deploy`."
  );
}

async function waitForDeployment(
  production: ProductionTarget,
  serviceId: string,
  previousDeploymentId?: string
): Promise<void> {
  const failureStatuses = new Set([
    "CRASHED",
    "FAILED",
    "NEEDS_APPROVAL",
    "REMOVED",
    "REMOVING",
    "SKIPPED",
    "SLEEPING",
  ]);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const deployment = await readLatestDeployment(production, serviceId);

    if (
      previousDeploymentId === undefined ||
      deployment.id !== previousDeploymentId
    ) {
      if (deployment.status === "SUCCESS") {
        return;
      }

      if (failureStatuses.has(deployment.status)) {
        throw new Error(
          `Railway deployment ${deployment.id} for service ${serviceId} ended with ${deployment.status}.`
        );
      }
    }

    await Bun.sleep(5000);
  }

  throw new Error(
    `Timed out waiting for Railway deployment of service ${serviceId}.`
  );
}

async function deployProduction(
  production: ProductionTarget,
  sharedConfig: string,
  apiConfig: string
): Promise<void> {
  const [currentReplication, currentCompact, currentApi] = await Promise.all([
    readProductionConfig(production, production.replicationServiceId),
    readProductionConfig(production, production.compactServiceId),
    readProductionConfig(production, production.apiServiceId),
  ]);
  const productionServiceIds = [
    production.replicationServiceId,
    production.compactServiceId,
    production.apiServiceId,
  ];
  const changedServiceIds = [
    ...(currentReplication === sharedConfig &&
    currentCompact === sharedConfig
      ? []
      : [production.replicationServiceId, production.compactServiceId]),
    ...(currentApi === apiConfig ? [] : [production.apiServiceId]),
  ];

  if (changedServiceIds.length === 0) {
    await Promise.all(
      productionServiceIds.map((serviceId) =>
        waitForDeployment(production, serviceId)
      )
    );
    console.log("Production PowerSync config already matches local config.");
    console.log("Production PowerSync deployments are healthy.");
    return;
  }

  const previousDeployments = await Promise.all(
    changedServiceIds.map((serviceId) => readLatestDeployment(production, serviceId))
  );
  const changedServices = Object.fromEntries(
    changedServiceIds.map((serviceId) => [
      serviceId,
      {
        variables: {
          POWERSYNC_CONFIG_B64: {
            value:
              serviceId === production.apiServiceId ? apiConfig : sharedConfig,
          },
        },
      },
    ])
  );
  const payload = JSON.stringify({
    services: changedServices,
  });

  await runRailway(
    [
      "environment",
      "edit",
      "--project",
      production.projectId,
      "--environment",
      production.environmentId,
      "--message",
      "Deploy locally tested PowerSync config",
      "--json",
    ],
    payload
  );
  await checkProduction(production, sharedConfig, apiConfig, 5);
  await Promise.all(
    changedServiceIds.map((serviceId, index) =>
      waitForDeployment(
        production,
        serviceId,
        previousDeployments[index]?.id ?? ""
      )
    )
  );
  console.log("Production PowerSync deployments succeeded.");
}

const renderedConfig = await renderConfig();
const encodedConfig = encodeConfig(renderedConfig);
const renderedApiConfig = renderApiConfig(renderedConfig);
const encodedApiConfig = encodeConfig(renderedApiConfig);
const check = process.argv.includes("--check-production");
const deploy = process.argv.includes("--deploy-production");
const validate = process.argv.includes("--validate");

if ([check, deploy, validate].filter(Boolean).length > 1) {
  throw new Error(
    "Choose one of --validate, --check-production, or --deploy-production."
  );
}

if (validate) {
  await validateConfigs(renderedConfig, renderedApiConfig);
} else if (check) {
  await checkProduction(readProductionTarget(), encodedConfig, encodedApiConfig);
} else if (deploy) {
  await deployProduction(readProductionTarget(), encodedConfig, encodedApiConfig);
} else {
  process.stdout.write(renderedConfig);
}
