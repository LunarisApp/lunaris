import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@lunarisapp/ui/components/field";
import {
  Controller,
  useForm,
  zodResolver,
} from "@lunarisapp/ui/components/form";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import {
  FolderLockedIcon,
  HugeiconsIcon,
  Upload01Icon,
  UserGroupIcon,
} from "@lunarisapp/ui/icons";
import {
  WORKSPACE_VISIBILITY,
  type WorkspaceVisibility,
} from "@repo/auth/sync-access";
import { usePowerSync } from "@repo/data/core";
import { usePlatform } from "@repo/platform";
import {
  createWorkspaceExtensionsService,
  DEFAULT_EXCALIDRAW_EXTENSION,
  replaceWorkspaceExtensions,
} from "@repo/data/features/workspace-extensions";
import {
  createWorkspace,
  createWorkspaceSchema,
  workspaceSlugSchema,
  useWorkspaceSlugCollision,
} from "@repo/data/features/workspaces";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useTranslation } from "react-i18next";
import slugify from "slugify";
import { toast } from "sonner";
import {
  getResourceCapacityErrorMessageKey,
  useReserveResourceCapacity,
} from "@repo/features/entitlements";
import { useExtensionRegistry } from "../extensions/extension-registry-context";
import { useCanCreateWorkspace } from "@repo/workspaces/permissions";
import { pickObsidianImportDirectory } from "./obsidian-folder-picker";
import {
  createObsidianImportPlan,
  createObsidianImportSession,
  getRemainingImportCount,
  type ObsidianImportSession,
  type ObsidianImportProgress,
  type ImportDirectory,
  importObsidianWorkspace,
} from "./obsidian-import-service";
import type { CreateWorkspaceDialogSchema } from "./types";

export { useDefaultTemplateWorkspaceSeeder } from "./default-template/use-default-template-seeder";
export { CreateWorkspaceLauncher } from "./launcher";

const WORKSPACE_VISIBILITY_OPTIONS = [
  { icon: UserGroupIcon, value: WORKSPACE_VISIBILITY.shared },
  { icon: FolderLockedIcon, value: WORKSPACE_VISIBILITY.private },
  { icon: FolderLockedIcon, value: WORKSPACE_VISIBILITY.local },
] as const;

const EMPTY_WORKSPACE_PLUGIN_IDS = [
  "lunaris.rich-text",
  "lunaris.excalidraw",
  "lunaris.kanban",
  "lunaris.file",
] as const;

function WorkspaceVisibilityField({
  canCreateCloudWorkspaces,
  control,
  errors,
}: {
  canCreateCloudWorkspaces: boolean;
  control: ReturnType<typeof useForm<CreateWorkspaceDialogSchema>>["control"];
  errors: ReturnType<
    typeof useForm<CreateWorkspaceDialogSchema>
  >["formState"]["errors"];
}) {
  const { t } = useTranslation();
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const labelId = `${id}-label`;

  return (
    <Field>
      <FieldLabel id={labelId}>
        {t("workspaces.workspaceVisibility")}
      </FieldLabel>
      <Controller
        control={control}
        name="visibility"
        render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger
              aria-describedby={`${descriptionId}${errors.visibility ? ` ${errorId}` : ""}`}
              aria-invalid={!!errors.visibility}
              aria-labelledby={labelId}
              className="w-full"
              data-testid="workspaces-create-visibility"
              disabled={!canCreateCloudWorkspaces}
              id={id}
            >
              <SelectValue>
                {(value: string | null) => {
                  if (!value) {
                    return null;
                  }
                  const icon =
                    WORKSPACE_VISIBILITY_OPTIONS.find(
                      (option) => option.value === value
                    )?.icon ?? FolderLockedIcon;
                  return (
                    <div className="flex items-center gap-2">
                      <HugeiconsIcon
                        aria-hidden="true"
                        className="size-4"
                        icon={icon}
                      />
                      <span>
                        {t(`workspaces.workspaceVisibility.${value}`)}
                      </span>
                    </div>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {WORKSPACE_VISIBILITY_OPTIONS.map(({ icon, value }) => (
                <SelectItem className="py-2" key={value} value={value}>
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                    icon={icon}
                  />
                  <span className="flex flex-col">
                    <span>{t(`workspaces.workspaceVisibility.${value}`)}</span>
                    <span className="font-normal text-muted-foreground text-xs">
                      {t(`workspaces.workspaceVisibility.${value}.description`)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <p className="text-muted-foreground text-xs" id={descriptionId}>
        {canCreateCloudWorkspaces
          ? t("workspaces.workspaceVisibilityDescription")
          : t("workspaces.workspaceVisibilityLocked")}
      </p>
      <FieldError errors={[errors.visibility]} id={errorId} />
    </Field>
  );
}

interface CreateWorkspaceDialogProps {
  canCreateCloudWorkspaces?: boolean;
  defaultVisibility?: WorkspaceVisibility;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  orgId: string;
}

export function ImportObsidianWorkspaceDialog({
  canCreateCloudWorkspaces = true,
  defaultVisibility = WORKSPACE_VISIBILITY.shared,
  open,
  onOpenChange,
  orgId,
}: CreateWorkspaceDialogProps) {
  const { t } = useTranslation();
  const { allExtensionIds } = useExtensionRegistry();
  const db = usePowerSync();
  const { downloads } = usePlatform();
  const canCreate = useCanCreateWorkspace();
  const reserveResourceCapacity = useReserveResourceCapacity();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [directory, setDirectory] = useState<ImportDirectory | null>(null);
  const [keepOriginals, setKeepOriginals] = useState(true);
  const [isPicking, setIsPicking] = useState(false);
  const [session, setSession] = useState<ObsidianImportSession | null>(null);
  const [progress, setProgress] = useState<ObsidianImportProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reportedWorkspaceRef = useRef<string | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields, isValid, touchedFields },
  } = useForm<CreateWorkspaceDialogSchema>({
    resolver: zodResolver(createWorkspaceSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      organizationId: orgId,
      slug: "",
      visibility: canCreateCloudWorkspaces
        ? defaultVisibility
        : WORKSPACE_VISIBILITY.local,
    },
  });

  const name = watch("name");
  const slug = watch("slug") || "";
  const plan = useMemo(
    () =>
      directory ? createObsidianImportPlan(directory, keepOriginals) : null,
    [directory, keepOriginals]
  );
  const stats = plan?.stats;
  const remaining = session ? getRemainingImportCount(session) : 0;
  const issues = useMemo(
    () =>
      session
        ? [...session.results.values()].filter(
            (result) => result.status === "failed" || result.warnings.length
          )
        : [],
    [session]
  );
  const { hasCollision } = useWorkspaceSlugCollision({
    organizationId: orgId,
    slug,
  });
  const showSlugCollision =
    !session?.workspaceId &&
    workspaceSlugSchema.safeParse(slug.trim()).success &&
    hasCollision;
  const showNameError =
    !!errors.name && (touchedFields.name || dirtyFields.name);
  const showSlugError =
    !!errors.slug &&
    (touchedFields.slug || dirtyFields.slug || dirtyFields.name);

  useEffect(() => {
    if (!dirtyFields.slug) {
      setValue("slug", slugify(name || "", { lower: true, strict: true }), {
        shouldValidate: true,
      });
    }
  }, [name, dirtyFields.slug, setValue]);

  const selectDirectory = async () => {
    if (!folderInputRef.current) {
      return;
    }

    setIsPicking(true);
    try {
      const selected = await pickObsidianImportDirectory(
        folderInputRef.current
      );
      if (!selected) {
        return;
      }
      setDirectory(selected);

      if (!dirtyFields.name) {
        setValue("name", selected.name, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      if (!dirtyFields.slug) {
        setValue(
          "slug",
          slugify(selected.name, { lower: true, strict: true }),
          {
            shouldValidate: true,
          }
        );
      }
    } catch (e) {
      log.error({
        tag: "Workspace",
        msg: "obsidian folder selection failed",
        error: parseError(e),
      });
      toast.error(t("workspaces.importFailed"));
    } finally {
      setIsPicking(false);
    }
  };

  const onSubmit = async (data: CreateWorkspaceDialogSchema) => {
    if (!(canCreate && directory && plan) || showSlugCollision) {
      return;
    }
    let active = session;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resourceCapacityReservation = await reserveResourceCapacity(
        active ? getRemainingImportCount(active) : plan.resourceCount
      );
      if (controller.signal.aborted) {
        resourceCapacityReservation.rollback();
        return;
      }
      active ??= createObsidianImportSession(plan);
      setSession(active);
      const result = await importObsidianWorkspace({
        allExtensionIds,
        data,
        db,
        directory,
        session: active,
        resourceCapacityReservation,
        signal: controller.signal,
        onProgress: setProgress,
      });
      if (reportedWorkspaceRef.current !== result.workspaceId) {
        posthog.capture("workspace_created", {
          template: "obsidian-import",
          converted_markdown_count: result.stats.convertedMarkdownCount,
          folder_count: result.stats.folderCount,
          original_file_count: result.stats.originalFileCount,
          skipped_count: result.stats.skippedCount,
          visibility: data.visibility,
        });
        reportedWorkspaceRef.current = result.workspaceId;
      }
    } catch (e) {
      log.error({
        tag: "Workspace",
        msg: "obsidian import failed",
        error: parseError(e),
      });
      toast.error(
        t(getResourceCapacityErrorMessageKey(e, "workspaces.importFailed"))
      );
    } finally {
      if (active) {
        setSession({ ...active });
      }
      abortRef.current = null;
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting || isPicking) {
      return;
    }
    if (!nextOpen) {
      reset();
      setDirectory(null);
      setSession(null);
      setProgress(null);
      setKeepOriginals(true);
      reportedWorkspaceRef.current = null;
    }
    onOpenChange(nextOpen);
  };
  const downloadReport = () => {
    if (!session) {
      return;
    }
    const report = {
      workspaceId: session.workspaceId,
      files: session.plan.operations.map((operation) => ({
        path: operation.path,
        kind: operation.kind,
        status: "pending",
        ...session.results.get(operation.key),
      })),
      skipped: session.plan.skipped,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    );
    try {
      downloads.downloadUrl(url, "obsidian-import-report.json");
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open && canCreate}>
      <DialogContent
        closeLabel={t("common.close")}
        data-testid="workspaces-import-obsidian-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("workspaces.importFromObsidian")}</DialogTitle>
          <DialogDescription>
            {t("workspaces.importFromObsidianDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <input
            aria-hidden="true"
            className="hidden"
            multiple
            ref={(node) => {
              folderInputRef.current = node;
              node?.setAttribute("webkitdirectory", "");
            }}
            tabIndex={-1}
            type="file"
          />
          <fieldset
            className={session ? "hidden" : "flex min-w-0 flex-col gap-4"}
            disabled={isSubmitting || isPicking || !!session}
          >
            <Field>
              <FieldTitle>{t("workspaces.importFolder")}</FieldTitle>
              <div className="flex items-center gap-2">
                <Button
                  data-testid="workspaces-import-folder-picker"
                  onClick={selectDirectory}
                  type="button"
                  variant="outline"
                >
                  <HugeiconsIcon aria-hidden="true" icon={Upload01Icon} />
                  {t("workspaces.chooseFolder")}
                </Button>
                <span
                  className="min-w-0 truncate text-muted-foreground text-sm"
                  role="status"
                >
                  {directory?.name ?? t("workspaces.noFolderSelected")}
                </span>
              </div>
              {!!stats && (
                <p aria-live="polite" className="text-muted-foreground text-xs">
                  {t("workspaces.importSummary", {
                    files: stats.originalFileCount,
                    folders: stats.folderCount,
                    markdown: stats.convertedMarkdownCount,
                    skipped: stats.skippedCount,
                  })}
                </p>
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepOriginals}
                onChange={(event) => setKeepOriginals(event.target.checked)}
              />
              {t("workspaces.importKeepOriginals")}
            </label>
            {plan && (
              <p className="text-muted-foreground text-xs">
                {t("workspaces.importCost", {
                  resources: plan.resourceCount,
                  source: (plan.sourceBytes / 1_048_576).toFixed(2),
                  retained: (plan.retainedFileBytes / 1_048_576).toFixed(2),
                })}
              </p>
            )}
            <Field>
              <FieldLabel htmlFor="workspace-import-name">
                {t("workspaces.workspaceName")}
              </FieldLabel>
              <Input
                aria-describedby={
                  showNameError ? "workspace-import-name-error" : undefined
                }
                aria-invalid={showNameError}
                autoComplete="off"
                data-testid="workspaces-import-name"
                id="workspace-import-name"
                placeholder={t("workspaces.workspaceNamePlaceholder")}
                {...register("name")}
              />
              <FieldError
                errors={[showNameError ? errors.name : undefined]}
                id="workspace-import-name-error"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="workspace-import-slug">
                {t("workspaces.workspaceSlug")}
              </FieldLabel>
              <Input
                aria-describedby={
                  showSlugError || showSlugCollision
                    ? "workspace-import-slug-error"
                    : undefined
                }
                aria-invalid={showSlugError || showSlugCollision}
                autoComplete="off"
                data-testid="workspaces-import-slug"
                id="workspace-import-slug"
                placeholder={t("workspaces.workspaceSlugPlaceholder")}
                {...register("slug")}
              />
              <FieldError
                data-testid="workspaces-import-slug-error"
                id="workspace-import-slug-error"
                errors={[
                  showSlugError ? errors.slug : undefined,
                  showSlugCollision
                    ? { message: t("workspaces.workspaceSlugTaken") }
                    : undefined,
                ]}
              />
            </Field>
            <WorkspaceVisibilityField
              canCreateCloudWorkspaces={canCreateCloudWorkspaces}
              control={control}
              errors={errors}
            />
          </fieldset>
          {!!session && (
            <div className="flex min-w-0 flex-col gap-3">
              <p role="status" className="text-sm">
                {isSubmitting
                  ? t("workspaces.importProgress", {
                      completed: progress?.completed ?? 0,
                      total: session.plan.resourceCount,
                    })
                  : t(
                      remaining
                        ? "workspaces.importIncomplete"
                        : "workspaces.importComplete",
                      { remaining }
                    )}
              </p>
              {!!isSubmitting && (
                <>
                  <progress
                    className="w-full"
                    aria-label={t("workspaces.importing")}
                    max={session.plan.resourceCount}
                    value={progress?.completed ?? 0}
                  />
                  <p
                    className="truncate text-muted-foreground text-xs"
                    title={progress?.path}
                  >
                    {progress?.path}
                  </p>
                </>
              )}
              {!isSubmitting && (
                <>
                  {!!remaining && (
                    <p className="text-muted-foreground text-xs">
                      {t("workspaces.importRetryHint")}
                    </p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {t("workspaces.importReportSummary", {
                      issues: issues.length,
                      skipped: session.plan.skipped.length,
                    })}
                  </p>
                  {(issues.length > 0 || session.plan.skipped.length > 0) && (
                    <details>
                      <summary className="cursor-pointer text-sm">
                        {t("workspaces.importReviewReport")}
                      </summary>
                      <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-xs">
                        {issues.slice(0, 50).map((result) => (
                          <li
                            key={`${result.kind}:${result.path}`}
                            className="break-words"
                          >
                            <strong>{result.path}</strong>
                            {" — "}
                            {result.status === "failed"
                              ? t("workspaces.importFileFailed")
                              : result.warnings
                                  .map((warning) =>
                                    t(`workspaces.importWarning.${warning}`)
                                  )
                                  .join(" ")}
                          </li>
                        ))}
                        {session.plan.skipped.slice(0, 50).map((entry) => (
                          <li key={entry.path} className="break-words">
                            {entry.path}
                            {" — "}
                            {t(`workspaces.importWarning.${entry.reason}`)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <Button
                    variant="outline"
                    type="button"
                    onClick={downloadReport}
                  >
                    {t("workspaces.importDownloadReport")}
                  </Button>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {isSubmitting ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
              >
                {t("common.cancel")}
              </Button>
            ) : (
              session && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("common.close")}
                </Button>
              )
            )}
            {(!session || remaining > 0) && (
              <Button
                aria-busy={isSubmitting}
                data-testid="workspaces-import-submit"
                disabled={
                  isSubmitting ||
                  isPicking ||
                  !isValid ||
                  !plan?.resourceCount ||
                  showSlugCollision
                }
                type="submit"
              >
                {isSubmitting
                  ? t("workspaces.importing")
                  : t(
                      session
                        ? "workspaces.importRetry"
                        : "workspaces.importWorkspace"
                    )}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateWorkspaceDialog({
  canCreateCloudWorkspaces = true,
  defaultVisibility = WORKSPACE_VISIBILITY.shared,
  open,
  onOpenChange,
  orgId,
}: CreateWorkspaceDialogProps) {
  const { t } = useTranslation();
  const { allExtensionIds } = useExtensionRegistry();
  const db = usePowerSync();
  const canCreate = useCanCreateWorkspace();

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields, isValid, touchedFields },
  } = useForm<CreateWorkspaceDialogSchema>({
    resolver: zodResolver(createWorkspaceSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      organizationId: orgId,
      slug: "",
      visibility: canCreateCloudWorkspaces
        ? defaultVisibility
        : WORKSPACE_VISIBILITY.local,
    },
  });

  const name = watch("name");
  const slug = watch("slug") || "";
  const { hasCollision } = useWorkspaceSlugCollision({
    organizationId: orgId,
    slug,
  });
  const showSlugCollision =
    workspaceSlugSchema.safeParse(slug.trim()).success && hasCollision;
  const showNameError =
    !!errors.name && (touchedFields.name || dirtyFields.name);
  const showSlugError =
    !!errors.slug &&
    (touchedFields.slug || dirtyFields.slug || dirtyFields.name);

  useEffect(() => {
    if (!dirtyFields.slug) {
      setValue("slug", slugify(name || "", { lower: true, strict: true }), {
        shouldValidate: true,
      });
    }
  }, [name, dirtyFields.slug, setValue]);

  const onSubmit = async (data: CreateWorkspaceDialogSchema) => {
    if (!canCreate || showSlugCollision) {
      return;
    }

    try {
      const workspaceId = await createWorkspace({ db, ...data });
      const enabledExtensions = EMPTY_WORKSPACE_PLUGIN_IDS.filter((pluginId) =>
        allExtensionIds.includes(pluginId)
      );
      await replaceWorkspaceExtensions({
        db,
        enabledExtensionIds: enabledExtensions,
        knownExtensionIds: allExtensionIds,
        workspaceId,
      });
      await createWorkspaceExtensionsService(db, workspaceId).install(
        "lunaris.excalidraw",
        DEFAULT_EXCALIDRAW_EXTENSION,
        {
          defaultExtensionIds: enabledExtensions,
          knownExtensionIds: allExtensionIds,
        }
      );

      log.info({
        tag: "Workspace",
        msg: "created",
        workspace: { id: workspaceId, template: "empty" },
      });
      posthog.capture("workspace_created", {
        template: "blank",
        plugin_count: enabledExtensions.length,
        visibility: data.visibility,
      });

      reset();
      onOpenChange(false);
    } catch (e) {
      log.error({
        tag: "Workspace",
        msg: "creation failed",
        error: parseError(e),
      });
      toast.error(t("common.error"));
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open && canCreate}>
      <DialogContent
        closeLabel={t("common.close")}
        data-testid="workspaces-create-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("workspaces.createWorkspace")}</DialogTitle>
          <DialogDescription>
            {t("workspaces.createEmptyDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Field>
            <FieldLabel htmlFor="workspace-name">
              {t("workspaces.workspaceName")}
            </FieldLabel>
            <Input
              aria-describedby={
                showNameError ? "workspace-name-error" : undefined
              }
              aria-invalid={showNameError}
              autoComplete="off"
              autoFocus
              data-testid="workspaces-create-name"
              id="workspace-name"
              placeholder={t("workspaces.workspaceNamePlaceholder")}
              {...register("name")}
            />
            <FieldError
              errors={[showNameError ? errors.name : undefined]}
              id="workspace-name-error"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="workspace-slug">
              {t("workspaces.workspaceSlug")}
            </FieldLabel>
            <Input
              aria-describedby={
                showSlugError || showSlugCollision
                  ? "workspace-slug-error"
                  : undefined
              }
              aria-invalid={showSlugError || showSlugCollision}
              autoComplete="off"
              data-testid="workspaces-create-slug"
              id="workspace-slug"
              placeholder={t("workspaces.workspaceSlugPlaceholder")}
              {...register("slug")}
            />
            <FieldError
              data-testid="workspaces-create-slug-error"
              id="workspace-slug-error"
              errors={[
                showSlugError ? errors.slug : undefined,
                showSlugCollision
                  ? { message: t("workspaces.workspaceSlugTaken") }
                  : undefined,
              ]}
            />
          </Field>
          <WorkspaceVisibilityField
            canCreateCloudWorkspaces={canCreateCloudWorkspaces}
            control={control}
            errors={errors}
          />
          <DialogFooter>
            <Button
              aria-busy={isSubmitting}
              data-testid="workspaces-create-submit"
              disabled={isSubmitting || !isValid || showSlugCollision}
              type="submit"
            >
              {isSubmitting
                ? t("workspaces.creating")
                : t("workspaces.createWorkspace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
