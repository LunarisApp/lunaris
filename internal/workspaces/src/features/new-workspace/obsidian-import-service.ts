import {
  createObsidianMarkdownConverter,
  readObsidianProperties,
  type ImportedReference,
  type ImportWarning,
  type ResolveImportReference,
} from "@extension/rich-text/import";
import type { Database } from "@repo/data/core";
import {
  createLocalFileWorkspaceResource,
  FILE_PLUGIN_ID,
  getFileMediaType,
} from "@repo/data/features/files";
import { replaceWorkspaceExtensions } from "@repo/data/features/workspace-extensions";
import {
  createWorkspaceFolder,
  createWorkspaceResource,
} from "@repo/data/features/workspace-resources";
import { createWorkspace } from "@repo/data/features/workspaces";
import type { ResourceCapacityReservation } from "@repo/features/entitlements";
import { createId } from "@repo/utils";
import { log } from "evlog";
import {
  createObsidianImportPlan,
  type ImportDirectory,
  type ObsidianImportPlan,
  type ObsidianImportStats,
  type ImportOperation,
} from "./obsidian-import-plan";
import type { CreateWorkspaceDialogSchema } from "./types";

export {
  createObsidianImportPlan,
  getImportResourceCount,
  getImportStats,
  isMarkdownFile,
  isSupportedImportFile,
} from "./obsidian-import-plan";
export type {
  ImportDirectory,
  ImportEntry,
  ImportFileEntry,
  ImportFolderEntry,
  ObsidianImportStats,
} from "./obsidian-import-plan";
export const OBSIDIAN_IMPORT_PLUGIN_IDS = [
  "lunaris.rich-text",
  FILE_PLUGIN_ID,
] as const;

export interface ImportFileResult {
  error?: string;
  kind: ImportOperation["kind"];
  path: string;
  status: "imported" | "failed";
  warnings: ImportWarning[];
}
export interface ObsidianImportSession {
  aliases: Map<string, Set<string>>;
  completedCount: number;
  extensionsEnabled: boolean;
  indexed: Set<string>;
  plan: ObsidianImportPlan;
  resourceIds: Map<string, string>;
  results: Map<string, ImportFileResult>;
  storageIds: Map<string, string>;
  workspaceId?: string;
}
export interface ObsidianImportProgress {
  completed: number;
  path: string;
  total: number;
}
export function createObsidianImportSession(
  plan: ObsidianImportPlan
): ObsidianImportSession {
  return {
    plan,
    completedCount: 0,
    extensionsEnabled: false,
    resourceIds: new Map(
      plan.operations.map((operation) => [operation.key, createId("res")])
    ),
    storageIds: new Map(),
    results: new Map(),
    aliases: new Map(),
    indexed: new Set(),
  };
}
export function getRemainingImportCount(session: ObsidianImportSession) {
  return session.plan.resourceCount - session.completedCount;
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "..") {
      if (!parts.length) {
        return null;
      }
      parts.pop();
    } else if (part && part !== ".") {
      parts.push(part);
    }
  }
  return parts.join("/");
}
function withoutExtension(path: string) {
  return path.replace(/\.(md|markdown)$/i, "");
}
function addIndex(index: Map<string, Set<string>>, key: string, path: string) {
  const paths = index.get(key) ?? new Set<string>();
  paths.add(path);
  index.set(key, paths);
}

export function createImportLinkResolver(session: ObsidianImportSession) {
  const byPath = new Map(
    session.plan.operations
      .filter(
        (operation) => operation.kind === "note" || operation.kind === "file"
      )
      .map((operation) => [operation.path, operation])
  );
  const names = new Map<string, Set<string>>();
  const notePaths = new Map<string, Set<string>>();
  for (const operation of byPath.values()) {
    const basename = operation.path.split("/").at(-1)!;
    addIndex(names, basename, operation.path);
    if (operation.kind === "note") {
      addIndex(names, withoutExtension(basename), operation.path);
      addIndex(notePaths, withoutExtension(operation.path), operation.path);
    }
  }
  return (sourcePath: string): ResolveImportReference =>
    (rawTarget, wiki) => {
      const rawPath = rawTarget.split(/[?#]/)[0]!;
      let target: string;
      try {
        target = decodeURIComponent(rawPath);
      } catch {
        target = rawPath;
      }
      const parent = sourcePath.includes("/")
        ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
        : "";
      const relative = normalizePath(`${parent ? `${parent}/` : ""}${target}`);
      const root = normalizePath(target);
      const candidates = target
        ? target.startsWith("/")
          ? [root]
          : wiki
            ? [root, relative]
            : [relative, root]
        : [sourcePath];
      let operation: ImportOperation | undefined;
      for (const path of candidates) {
        if (path === null) {
          continue;
        }
        operation = byPath.get(path);
        if (!operation) {
          const matches = notePaths.get(path);
          if (matches && matches.size > 1) {
            return { warning: "ambiguous-link" };
          }
          if (matches?.size === 1) {
            operation = byPath.get([...matches][0]!);
          }
        }
        if (operation) {
          break;
        }
      }
      if (!operation && wiki) {
        const matches = new Set([
          ...(names.get(target) ?? []),
          ...(session.aliases.get(target) ?? []),
        ]);
        if (matches.size === 1) {
          operation = byPath.get([...matches][0]!);
        } else if (matches.size > 1) {
          return { warning: "ambiguous-link" };
        }
      }
      if (!operation) {
        return { warning: "unresolved-link" };
      }
      // Never commit a note with an attachment reference that cannot yet resolve.
      if (
        operation.kind === "file" &&
        session.results.get(operation.key)?.status !== "imported"
      ) {
        throw new Error(`Attachment has not been imported: ${operation.path}`);
      }
      const reference: ImportedReference = {
        resourceId: session.resourceIds.get(operation.key)!,
        workspaceId: session.workspaceId!,
        name: operation.name,
        image:
          operation.kind === "file" &&
          getFileMediaType(operation.file!.type, operation.name).startsWith(
            "image/"
          ),
        storageId: session.storageIds.get(operation.key),
      };
      return { reference };
    };
}

export async function importObsidianWorkspace(params: {
  allExtensionIds: readonly string[];
  data: CreateWorkspaceDialogSchema;
  db: Database;
  directory: ImportDirectory;
  session?: ObsidianImportSession;
  resourceCapacityReservation: ResourceCapacityReservation;
  signal?: AbortSignal;
  onProgress?: (progress: ObsidianImportProgress) => void;
}) {
  const {
    allExtensionIds,
    data,
    db,
    resourceCapacityReservation,
    signal,
    onProgress,
  } = params;
  const session =
    params.session ??
    createObsidianImportSession(createObsidianImportPlan(params.directory));
  let created = 0;
  let converter: ReturnType<typeof createObsidianMarkdownConverter> | undefined;
  const progress = (path: string) =>
    onProgress?.({
      path,
      completed: session.plan.resourceCount - getRemainingImportCount(session),
      total: session.plan.resourceCount,
    });
  const yieldToBrowser = () =>
    new Promise<void>((resolve) => setTimeout(resolve, 0));
  try {
    signal?.throwIfAborted();
    session.workspaceId ??= await createWorkspace({ db, ...data });
    const workspaceId = session.workspaceId;
    if (!session.extensionsEnabled) {
      await replaceWorkspaceExtensions({
        db,
        enabledExtensionIds: OBSIDIAN_IMPORT_PLUGIN_IDS.filter((id) =>
          allExtensionIds.includes(id)
        ),
        knownExtensionIds: allExtensionIds,
        workspaceId,
      });
      session.extensionsEnabled = true;
    }
    // Index aliases before any conversion, including forward references. Keep file
    // contents on disk; only properties needed for lookup stay in memory.
    for (const operation of session.plan.operations) {
      if (signal?.aborted) {
        break;
      }
      if (operation.kind !== "note" || session.indexed.has(operation.key)) {
        continue;
      }
      progress(operation.path);
      try {
        const { aliases } = readObsidianProperties(
          await operation.file!.text()
        );
        for (const alias of aliases) {
          addIndex(session.aliases, alias, operation.path);
        }
        session.indexed.add(operation.key);
      } catch {
        /* The per-file import below reports read failures and remains retryable. */
      }
      await yieldToBrowser();
    }
    const resolve = createImportLinkResolver(session);
    // Parents first, then sources/attachments, then notes. A conversion failure
    // cannot prevent retaining its original file.
    const ordered = [
      ...session.plan.operations.filter(
        (operation) => operation.kind === "folder"
      ),
      ...session.plan.operations.filter(
        (operation) => operation.kind === "file" || operation.kind === "source"
      ),
      ...session.plan.operations.filter(
        (operation) => operation.kind === "note"
      ),
    ];
    for (const operation of ordered) {
      if (signal?.aborted) {
        break;
      }
      if (session.results.get(operation.key)?.status === "imported") {
        continue;
      }
      progress(operation.path);
      try {
        if (
          operation.parentKey &&
          session.results.get(operation.parentKey)?.status !== "imported"
        ) {
          throw new Error("Parent folder has not been imported");
        }
        const parentId = operation.parentKey
          ? session.resourceIds.get(operation.parentKey)!
          : null;
        const common = {
          db,
          workspaceId,
          parentId,
          position: operation.position,
        };
        let warnings: ImportWarning[] = [];
        if (operation.kind === "folder") {
          session.resourceIds.set(
            operation.key,
            await createWorkspaceFolder({ ...common, name: operation.name })
          );
        } else if (operation.kind === "note") {
          converter ??= createObsidianMarkdownConverter();
          const source = await operation.file!.text();
          const converted = converter.convert(source, resolve(operation.path));
          warnings = converted.warnings;
          await createWorkspaceResource({
            ...common,
            id: session.resourceIds.get(operation.key)!,
            name: operation.name,
            resourceTypeId: "lunaris.rich-text",
            schemaVersion: 1,
            storage: {
              content: { kind: "yjs", initialize: converted.initialize },
              obsidian: {
                kind: "key-value",
                initialize: () => ({
                  sourcePath: operation.path,
                  properties: converted.metadata.properties,
                  aliases: converted.metadata.aliases,
                  tags: converted.metadata.tags,
                  frontmatter: converted.metadata.frontmatter,
                  warnings,
                  ...(warnings.length ? { source } : {}),
                }),
              },
            },
          });
        } else {
          const file = await createLocalFileWorkspaceResource({
            ...common,
            id: session.resourceIds.get(operation.key)!,
            file: operation.file!,
          });
          session.storageIds.set(operation.key, file.storageId);
        }
        session.results.set(operation.key, {
          path: operation.path,
          kind: operation.kind,
          status: "imported",
          warnings,
        });
        session.completedCount++;
        created++;
      } catch (error) {
        session.results.set(operation.key, {
          path: operation.path,
          kind: operation.kind,
          status: "failed",
          warnings: [],
          error: error instanceof Error ? error.message : "Import failed",
        });
      }
      progress(operation.path);
      await yieldToBrowser();
    }
    const stats: ObsidianImportStats = {
      convertedMarkdownCount: 0,
      folderCount: 0,
      originalFileCount: 0,
      skippedCount: session.plan.skipped.length,
    };
    for (const result of session.results.values()) {
      if (result.status !== "imported") {
        continue;
      }
      if (result.kind === "note") {
        stats.convertedMarkdownCount++;
      } else if (result.kind === "folder") {
        stats.folderCount++;
      } else {
        stats.originalFileCount++;
      }
    }
    const complete = getRemainingImportCount(session) === 0;
    log.info({
      tag: "Workspace",
      msg: "obsidian import finished",
      workspace: { id: workspaceId, stats, complete },
    });
    return {
      workspaceId,
      stats,
      session,
      complete,
      cancelled: !!signal?.aborted,
    };
  } finally {
    converter?.destroy();
    resourceCapacityReservation.commit(created);
    resourceCapacityReservation.rollback();
  }
}
