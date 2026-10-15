import * as hugeicons from "@hugeicons/core-free-icons";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";

const DEFAULT_SIZE = 192;
const MIN_SIZE = 32;
const MAX_SIZE = 2048;
const ICON_SCALE = 0.65;
const ICON_OPACITY = 0.65;
const ICON_STROKE_WIDTH = 2.5;
const BACKGROUND_DIM = 0.32;

export type ExtensionIconFormat = "png" | "webp";

const defaultBackgroundPath = path.join(
  import.meta.dir,
  "assets/extension-icon-background.webp",
);

export type HugeiconDefinition = readonly (
  readonly [string, Readonly<Record<string, number | string>>]
)[];

export interface ResolvedHugeicon {
  definition: HugeiconDefinition;
  name: string;
}

export interface GenerateExtensionIconOptions {
  backgroundPath?: string;
  definition: HugeiconDefinition;
  format?: ExtensionIconFormat;
  size?: number;
}

function normalizeIconName(value: string): string {
  return value.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}

function isHugeiconDefinition(value: unknown): value is HugeiconDefinition {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (node) =>
        Array.isArray(node) &&
        node.length === 2 &&
        typeof node[0] === "string" &&
        typeof node[1] === "object" &&
        node[1] !== null,
    )
  );
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] ?? right.length;
}

function availableIcons(
  iconSet: Readonly<Record<string, unknown>>,
): ResolvedHugeicon[] {
  return Object.entries(iconSet)
    .filter(
      (entry): entry is [string, HugeiconDefinition] =>
        entry[0].endsWith("Icon") && isHugeiconDefinition(entry[1]),
    )
    .map(([name, definition]) => ({ definition, name }));
}

export function resolveHugeicon(
  requestedName: string,
  iconSet: Readonly<Record<string, unknown>> = hugeicons,
): ResolvedHugeicon {
  const icons = availableIcons(iconSet);
  const normalized = normalizeIconName(requestedName);
  const normalizedName = normalized.endsWith("icon")
    ? normalized
    : `${normalized}icon`;
  const match = icons.find(
    ({ name }) => normalizeIconName(name) === normalizedName,
  );

  if (match) return match;

  const suggestions = icons
    .map(({ name }) => ({
      distance: levenshtein(normalizedName, normalizeIconName(name)),
      name,
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.name.localeCompare(right.name),
    )
    .slice(0, 5)
    .map(({ name }) => name);
  const suffix = suggestions.length
    ? ` Did you mean: ${suggestions.join(", ")}?`
    : "";
  throw new Error(`Unknown Hugeicons icon: ${requestedName}.${suffix}`);
}

function escapeXml(value: number | string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toSvgAttributeName(name: string): string {
  return name.replaceAll(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function renderSvgNodes(definition: HugeiconDefinition): string {
  return definition
    .map(([tag, properties]) => {
      const attributes = Object.entries({
        ...properties,
        strokeWidth: ICON_STROKE_WIDTH,
      })
        .filter(([name]) => name !== "key")
        .map(
          ([name, value]) =>
            `${toSvgAttributeName(name)}="${escapeXml(value)}"`,
        )
        .join(" ");
      return `<${tag}${attributes ? ` ${attributes}` : ""}/>`;
    })
    .join("");
}

function renderIconSvg(definition: HugeiconDefinition, size: number): Buffer {
  const inset = 12 * (1 - ICON_SCALE);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" color="#fff" fill="none">
      <defs>
        <filter id="glass" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
          <feDropShadow dx="0" dy="0.6" stdDeviation="1.2" flood-color="#000" flood-opacity="0.55"/>
          <feDropShadow dx="0" dy="-0.3" stdDeviation="0" flood-color="#fff" flood-opacity="0.45"/>
        </filter>
      </defs>
      <g transform="translate(${inset} ${inset}) scale(${ICON_SCALE})" opacity="${ICON_OPACITY}" filter="url(#glass)">
        ${renderSvgNodes(definition)}
      </g>
    </svg>
  `);
}

function renderDimOverlay(size: number): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#000" fill-opacity="${BACKGROUND_DIM}"/>
    </svg>
  `);
}

function validateSize(value: number): void {
  if (!Number.isInteger(value) || value < MIN_SIZE || value > MAX_SIZE) {
    throw new Error(`Size must be an integer from ${MIN_SIZE} to ${MAX_SIZE}.`);
  }
}

export async function generateExtensionIcon({
  backgroundPath = defaultBackgroundPath,
  definition,
  format = "webp",
  size = DEFAULT_SIZE,
}: GenerateExtensionIconOptions): Promise<Buffer> {
  validateSize(size);

  const image = sharp(backgroundPath)
    .resize(size, size, { fit: "cover" })
    .composite([
      { input: renderDimOverlay(size), blend: "over" },
      { input: renderIconSvg(definition, size), blend: "over" },
    ]);

  return format === "png"
    ? image.png({ adaptiveFiltering: true, compressionLevel: 9 }).toBuffer()
    : image.webp({ effort: 6, quality: 90, smartSubsample: true }).toBuffer();
}

function helpText(): string {
  return `Generate a branded Lunaris extension icon from Hugeicons.

Usage:
  bun run extension-icon:generate <icon-name> [options]

Options:
  -f, --format <type>  Output format: webp or png (default: webp)
  -o, --output <path>  Output path (default: ./<IconName>.<format>)
  -s, --size <pixels>  Square size, ${MIN_SIZE}-${MAX_SIZE} (default: ${DEFAULT_SIZE})
      --force          Overwrite an existing output
  -h, --help           Show help

Examples:
  bun run extension-icon:generate NoteIcon
  bun run extension-icon:generate note --size 512 --output ./note.webp
  bun run extension-icon:generate note --format png --output ./icon.png
`;
}

export async function runGenerateExtensionIconCli(
  arguments_ = process.argv.slice(2),
): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: arguments_,
    options: {
      force: { type: "boolean", default: false },
      format: { type: "string", short: "f", default: "webp" },
      help: { type: "boolean", short: "h", default: false },
      output: { type: "string", short: "o" },
      size: { type: "string", short: "s" },
    },
    strict: true,
  });

  if (values.help) {
    process.stdout.write(helpText());
    return;
  }
  if (positionals.length !== 1) {
    throw new Error("Provide exactly one Hugeicons icon name. Use --help for usage.");
  }

  const icon = resolveHugeicon(positionals[0] ?? "");
  if (values.format !== "png" && values.format !== "webp") {
    throw new Error("Format must be png or webp.");
  }
  const format = values.format;
  const size = values.size ? Number(values.size) : DEFAULT_SIZE;
  validateSize(size);
  const outputPath = path.resolve(
    process.cwd(),
    values.output ?? `${icon.name}.${format}`,
  );
  if (path.extname(outputPath).toLowerCase() !== `.${format}`) {
    throw new Error(`Output path must use the .${format} extension.`);
  }
  const output = await generateExtensionIcon({
    definition: icon.definition,
    format,
    size,
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    await writeFile(outputPath, output, values.force ? undefined : { flag: "wx" });
  } catch (error) {
    if (
      !values.force &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new Error(
        `Output already exists: ${outputPath}. Pass --force to overwrite it.`,
      );
    }
    throw error;
  }

  process.stdout.write(`${outputPath}\n`);
}

if (import.meta.main) {
  try {
    await runGenerateExtensionIconCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
