import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const brandDirectory = path.join(repositoryRoot, "assets/brand");
const desktopDirectory = path.join(repositoryRoot, "apps/desktop");
const desktopIconsDirectory = path.join(desktopDirectory, "src-tauri/icons");
const desktopPublicDirectory = path.join(desktopDirectory, "public");
const landingPublicDirectory = path.join(repositoryRoot, "apps/landing/public");
const webPublicDirectory = path.join(repositoryRoot, "apps/web/public");

const tauriManifest = path.join(brandDirectory, "tauri-icon.json");
const appIconDark = path.join(brandDirectory, "source/app-icon-dark.svg");
const markOnDark = path.join(brandDirectory, "source/mark-on-dark.svg");
const markOnLight = path.join(brandDirectory, "source/mark-on-light.svg");

interface GeneratedFile {
  destination: string;
  source: string;
}

interface GeneratedAssets {
  files: GeneratedFile[];
  tauriIconsDirectory: string;
}

async function runTauriIcon(
  input: string,
  output: string,
  pngSizes: number[] = []
): Promise<void> {
  const command = [
    process.execPath,
    "run",
    "tauri",
    "icon",
    input,
    "--output",
    output,
  ];

  for (const size of pngSizes) {
    command.push("--png", String(size));
  }

  const childProcess = Bun.spawn(command, {
    cwd: desktopDirectory,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await childProcess.exited;

  if (exitCode !== 0) {
    throw new Error(`Tauri icon generation failed with exit code ${exitCode}`);
  }
}

async function generateInto(
  temporaryDirectory: string
): Promise<GeneratedAssets> {
  const tauriIconsDirectory = path.join(temporaryDirectory, "tauri-icons");
  const webPngDirectory = path.join(temporaryDirectory, "web-png");

  await Promise.all([
    runTauriIcon(tauriManifest, tauriIconsDirectory),
    runTauriIcon(appIconDark, webPngDirectory, [192]),
  ]);
  await copyFile(appIconDark, path.join(tauriIconsDirectory, "icon.svg"));

  const generatedIcon = (relativePath: string): string =>
    path.join(tauriIconsDirectory, relativePath);

  return {
    files: [
      {
        destination: path.join(desktopPublicDirectory, "favicon.ico"),
        source: generatedIcon("icon.ico"),
      },
      {
        destination: path.join(desktopPublicDirectory, "favicon-dark.svg"),
        source: markOnDark,
      },
      {
        destination: path.join(desktopPublicDirectory, "favicon-light.svg"),
        source: markOnLight,
      },
      {
        destination: path.join(landingPublicDirectory, "favicon.ico"),
        source: generatedIcon("icon.ico"),
      },
      {
        destination: path.join(landingPublicDirectory, "favicon-dark.svg"),
        source: markOnDark,
      },
      {
        destination: path.join(landingPublicDirectory, "favicon-light.svg"),
        source: markOnLight,
      },
      {
        destination: path.join(landingPublicDirectory, "apple-touch-icon.png"),
        source: generatedIcon("ios/AppIcon-60x60@3x.png"),
      },
      {
        destination: path.join(
          landingPublicDirectory,
          "img/lunaris-mark-dark.svg"
        ),
        source: markOnDark,
      },
      {
        destination: path.join(
          landingPublicDirectory,
          "img/lunaris-mark-light.svg"
        ),
        source: markOnLight,
      },
      {
        destination: path.join(webPublicDirectory, "favicon.ico"),
        source: generatedIcon("icon.ico"),
      },
      {
        destination: path.join(webPublicDirectory, "favicon-dark.svg"),
        source: markOnDark,
      },
      {
        destination: path.join(webPublicDirectory, "favicon-light.svg"),
        source: markOnLight,
      },
      {
        destination: path.join(webPublicDirectory, "apple-touch-icon.png"),
        source: generatedIcon("ios/AppIcon-60x60@3x.png"),
      },
      {
        destination: path.join(webPublicDirectory, "pwa-192x192.png"),
        source: path.join(webPngDirectory, "192x192.png"),
      },
      {
        destination: path.join(webPublicDirectory, "pwa-512x512.png"),
        source: generatedIcon("icon.png"),
      },
      {
        destination: path.join(webPublicDirectory, "pwa-maskable-512x512.png"),
        source: generatedIcon("icon.png"),
      },
    ],
    tauriIconsDirectory,
  };
}

function assertManagedPath(target: string): void {
  const relativePath = path.relative(repositoryRoot, target);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to modify unmanaged path: ${target}`);
  }
}

async function writeAssets(assets: GeneratedAssets): Promise<void> {
  assertManagedPath(desktopIconsDirectory);
  await rm(desktopIconsDirectory, { force: true, recursive: true });
  await cp(assets.tauriIconsDirectory, desktopIconsDirectory, {
    recursive: true,
  });

  for (const file of assets.files) {
    assertManagedPath(file.destination);
    await mkdir(path.dirname(file.destination), { recursive: true });
    await copyFile(file.source, file.destination);
  }
}

async function listRelativeFiles(
  directory: string,
  baseDirectory = directory
): Promise<string[]> {
  const relativeFiles: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      relativeFiles.push(
        ...(await listRelativeFiles(absolutePath, baseDirectory))
      );
    } else if (entry.isFile()) {
      relativeFiles.push(path.relative(baseDirectory, absolutePath));
    }
  }

  return relativeFiles.sort();
}

async function filesMatch(left: string, right: string): Promise<boolean> {
  try {
    const [leftContents, rightContents] = await Promise.all([
      readFile(left),
      readFile(right),
    ]);
    return leftContents.equals(rightContents);
  } catch {
    return false;
  }
}

async function findDirectoryDifferences(
  generatedDirectory: string,
  committedDirectory: string
): Promise<string[]> {
  const [generatedFiles, committedFiles] = await Promise.all([
    listRelativeFiles(generatedDirectory),
    listRelativeFiles(committedDirectory),
  ]);
  const generatedFileSet = new Set(generatedFiles);
  const committedFileSet = new Set(committedFiles);
  const allFiles = new Set([...generatedFiles, ...committedFiles]);
  const differences: string[] = [];

  for (const relativePath of [...allFiles].sort()) {
    // Tauri's ICNS container differs between identical runs. Matching PNG
    // outputs still detect visual drift, while both directories must contain it.
    if (
      relativePath === "icon.icns" &&
      generatedFileSet.has(relativePath) &&
      committedFileSet.has(relativePath)
    ) {
      continue;
    }

    const matches = await filesMatch(
      path.join(generatedDirectory, relativePath),
      path.join(committedDirectory, relativePath)
    );

    if (!matches) {
      differences.push(path.join(committedDirectory, relativePath));
    }
  }

  return differences;
}

async function checkAssets(assets: GeneratedAssets): Promise<void> {
  const differences = await findDirectoryDifferences(
    assets.tauriIconsDirectory,
    desktopIconsDirectory
  );

  for (const file of assets.files) {
    if (!(await filesMatch(file.source, file.destination))) {
      differences.push(file.destination);
    }
  }

  if (differences.length === 0) {
    console.log("Brand assets are up to date.");
    return;
  }

  console.error("Brand assets need regeneration:");
  for (const difference of [...new Set(differences)].sort()) {
    console.error(`- ${path.relative(repositoryRoot, difference)}`);
  }
  console.error("Run: bun run brand:generate");
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  const unsupportedArguments = arguments_.filter(
    (argument) => argument !== "--check"
  );

  if (unsupportedArguments.length > 0) {
    throw new Error(
      `Unsupported arguments: ${unsupportedArguments.join(", ")}`
    );
  }

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "lunaris-brand-")
  );

  try {
    const assets = await generateInto(temporaryDirectory);

    if (arguments_.includes("--check")) {
      await checkAssets(assets);
    } else {
      await writeAssets(assets);
      console.log("Brand assets generated.");
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
