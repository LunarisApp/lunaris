"use client";

import { PLUGIN_API_SUPPORTED_VERSIONS } from "@lunarisapp/plugin-sdk";
import {
  isMarketplaceVersionCompatible,
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_MARKETPLACE_LOCATION,
  OFFICIAL_MARKETPLACE_MANIFEST_URL,
  type ExtensionMarketplaceEntry,
  type ExtensionMarketplaceScreenshot,
} from "@lunarisapp/plugin-sdk/marketplace";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lunarisapp/ui/components/alert-dialog";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lunarisapp/ui/components/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lunarisapp/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import {
  ArrowUpRight01Icon,
  Cancel01Icon,
  HugeiconsIcon,
  Image01Icon,
  Search01Icon,
  Store01Icon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { usePowerSync } from "@repo/data/core";
import {
  createWorkspaceExtensionsService,
  toWorkspaceExtensionInstallation,
  useWorkspaceExtensionsQuery,
  type WorkspaceExtensionInstallation,
} from "@repo/data/features/workspace-extensions";
import {
  type OrganizationExtensionRegistry,
  useOrganizationExtensionRegistriesQuery,
} from "@repo/data/features/organization-extension-registries";
import { useOnlineStatus, usePlatform } from "@repo/platform";
import { useQueries } from "@tanstack/react-query";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePermission } from "@repo/features/permissions";
import { useCurrentWorkspace } from "../workspace";
import { ExtensionIdeaDialog } from "./extension-idea-dialog";
import {
  BUILTIN_EXTENSION_ICON_URLS,
  BUILTIN_EXTENSION_STORE_DETAILS,
  type ExtensionStoreDetails,
} from "./builtin-store-details";
import { useExtensionRegistry } from "./extension-registry-context";
import { extensionMarketplaceQueryOptions } from "./marketplace-queries";
import { notifyWorkspaceExtensionsChanged } from "./workspace-extension-change-notification";

interface StoreItem {
  builtin: boolean;
  catalogOnline?: boolean;
  description: string;
  developer: string;
  entry?: ExtensionMarketplaceEntry;
  iconUrl?: string;
  id: string;
  keywords?: readonly string[];
  name: string;
  registryId?: string;
  storeDetails?: ExtensionStoreDetails;
  version: string;
  website?: string;
}

interface PendingInstall {
  item: StoreItem;
  version: string;
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatWebsite(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function StoreIcon({ className, item }: { className: string; item: StoreItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.iconUrl]);

  if (item.iconUrl && !failed) {
    return (
      <img
        alt=""
        className={`${className} object-cover`}
        draggable={false}
        onError={() => setFailed(true)}
        src={item.iconUrl}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} bg-muted text-muted-foreground flex items-center justify-center`}
    >
      <HugeiconsIcon
        className="size-1/2"
        icon={Store01Icon}
        strokeWidth={1.8}
      />
    </span>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 text-sm underline decoration-border underline-offset-4 transition-colors"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <span className="truncate">{label}</span>
      <HugeiconsIcon className="size-3.5 shrink-0" icon={ArrowUpRight01Icon} strokeWidth={2} />
    </a>
  );
}

function ExtensionCard({
  busy,
  canWrite,
  enabled,
  installedVersion,
  item,
  onInstall,
  onOpenDetails,
  onToggle,
  onUninstall,
  online,
}: {
  busy: boolean;
  canWrite: boolean;
  enabled: boolean;
  installedVersion?: string;
  item: StoreItem;
  onInstall: (item: StoreItem, version: string) => void;
  onOpenDetails: (item: StoreItem) => void;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
  online: boolean;
}) {
  const { t } = useTranslation();
  const compatible = item.entry?.versions.filter((version) =>
    isMarketplaceVersionCompatible(PLUGIN_API_SUPPORTED_VERSIONS, version),
  );
  const latest =
    compatible?.find((version) => version.version === item.entry?.latestVersion) ??
    compatible?.[0];

  return (
    <Card className={busy ? "h-full opacity-60" : "h-full"} size="sm">
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)] gap-x-2.5">
        <StoreIcon className="row-span-2 size-10 rounded-lg" item={item} />
        <CardTitle className="col-start-2 truncate">{item.name}</CardTitle>
        <CardDescription className="col-start-2 truncate">
          {t("organization.extensions.byDeveloper", { developer: item.developer })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
          {item.description}
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {t("organization.extensions.versionValue", {
              version: installedVersion ?? latest?.version ?? item.version,
            })}
          </span>
          {item.builtin && (
            <Badge variant="outline">{t("extensions.builtIn")}</Badge>
          )}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          <Button
            aria-label={t("organization.extensions.viewDetailsFor", {
              name: item.name,
            })}
            onClick={() => onOpenDetails(item)}
            size="sm"
            variant="outline"
          >
            {t("organization.extensions.viewDetails")}
          </Button>
          {item.builtin ? (
            <Button
              className={enabled ? "dark:text-foreground" : undefined}
              disabled={!canWrite || busy}
              onClick={() => onToggle(item.id, !enabled)}
              size="sm"
              variant={enabled ? "destructive" : "default"}
            >
              {t(enabled ? "extensions.disableExtension" : "extensions.enableExtension")}
            </Button>
          ) : latest && latest.version !== installedVersion ? (
            <Button
              disabled={!canWrite || !online || !item.catalogOnline || busy}
              onClick={() => onInstall(item, latest.version)}
              size="sm"
            >
              {installedVersion
                ? t("organization.extensions.update")
                : t("organization.extensions.install")}
            </Button>
          ) : null}
          {!item.builtin && installedVersion && (
            <Button
              className="dark:text-foreground"
              disabled={!canWrite || busy}
              onClick={() => onUninstall(item.id)}
              size="sm"
              variant="destructive"
            >
              {t("organization.extensions.uninstall")}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function ExtensionScreenshot({
  screenshot,
}: {
  screenshot: ExtensionMarketplaceScreenshot;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className="focus-visible:ring-ring/50 w-[min(32rem,88%)] shrink-0 snap-start cursor-zoom-in rounded-xl text-left outline-none focus-visible:ring-[3px]"
        render={<button type="button" />}
      >
        <img
          alt={screenshot.alt}
          className="aspect-video w-full rounded-xl border bg-muted object-cover"
          loading="lazy"
          src={screenshot.url}
        />
      </DialogTrigger>
      <DialogContent
        className="w-fit overflow-hidden p-2 ease-[cubic-bezier(0.22,1,0.36,1)] data-closed:zoom-out-85 data-closed:duration-300 data-open:zoom-in-85 data-open:duration-350 motion-reduce:animate-none sm:max-w-[calc(100%-2rem)]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{screenshot.alt}</DialogTitle>
        <DialogClose
          className="focus-visible:ring-ring/50 cursor-zoom-out rounded-lg outline-none focus-visible:ring-[3px]"
          type="button"
        >
          <img
            alt={screenshot.alt}
            className="max-h-[calc(100dvh-3rem)] max-w-[calc(100vw-3rem)] rounded-lg object-contain"
            src={screenshot.url}
          />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function ExtensionDetailsDialog({
  busy,
  canWrite,
  enabled,
  installedVersion,
  item,
  onInstall,
  onOpenChange,
  onToggle,
  onUninstall,
  online,
}: {
  busy: boolean;
  canWrite: boolean;
  enabled: boolean;
  installedVersion?: string;
  item: StoreItem | null;
  onInstall: (item: StoreItem, version: string) => void;
  onOpenChange: (open: boolean) => void;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onUninstall: (pluginId: string) => void;
  online: boolean;
}) {
  const { t } = useTranslation();
  const versions = useMemo(
    () =>
      item?.entry?.versions.filter((version) =>
        isMarketplaceVersionCompatible(PLUGIN_API_SUPPORTED_VERSIONS, version),
      ) ?? [],
    [item],
  );
  const latest =
    versions.find((version) => version.version === item?.entry?.latestVersion) ??
    versions[0];
  const installedIsCompatible = versions.some(
    (version) => version.version === installedVersion,
  );
  const [selectedVersion, setSelectedVersion] = useState("");

  useEffect(() => {
    setSelectedVersion(
      installedIsCompatible
        ? (installedVersion ?? "")
        : (latest?.version ?? item?.version ?? ""),
    );
  }, [installedIsCompatible, installedVersion, item?.id, item?.version, latest?.version]);

  if (!item) return null;
  const entry = item.entry;
  const storeDetails = item.storeDetails;
  const selectedRelease = versions.find(
    (version) => version.version === selectedVersion,
  );
  const links = entry
    ? [
        { href: entry.supportUrl, label: t("organization.extensions.support") },
        { href: entry.repository, label: t("organization.extensions.sourceCode") },
        { href: entry.privacyPolicyUrl, label: t("organization.extensions.privacyPolicy") },
        { href: entry.termsOfServiceUrl, label: t("organization.extensions.termsOfService") },
      ].filter((link): link is { href: string; label: string } => Boolean(link.href))
    : [];

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="p-5 pr-12 sm:p-6 sm:pr-14">
          <div className="flex min-w-0 items-center gap-4">
            <StoreIcon className="size-14 shrink-0 rounded-2xl sm:size-16" item={item} />
            <div className="min-w-0 space-y-1">
              <DialogTitle className="min-w-0 break-words text-xl leading-tight sm:text-2xl">
                {item.name}
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm leading-relaxed">
                {item.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 overflow-y-auto border-t lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-7 p-5 sm:p-6">
            {storeDetails?.screenshots?.length ? (
              <section className="space-y-3">
                <h3 className="font-medium">{t("organization.extensions.screenshots")}</h3>
                <div
                  aria-label={t("organization.extensions.screenshots")}
                  className="focus-visible:ring-ring/50 flex snap-x snap-mandatory gap-3 overflow-x-auto rounded-xl pb-2 outline-none focus-visible:ring-[3px]"
                  role="region"
                  tabIndex={0}
                >
                  {storeDetails.screenshots.map((screenshot) => (
                    <ExtensionScreenshot
                      key={screenshot.url}
                      screenshot={screenshot}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-muted-foreground flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 px-6 text-center">
                <HugeiconsIcon className="size-6" icon={Image01Icon} strokeWidth={1.6} />
                <p className="text-sm">{t("organization.extensions.noScreenshots")}</p>
              </div>
            )}
            <section className="space-y-2">
              <h3 className="font-medium">{t("organization.extensions.about")}</h3>
              <p className="text-muted-foreground max-w-[70ch] whitespace-pre-line text-sm leading-relaxed">
                {storeDetails?.longDescription ?? item.description}
              </p>
            </section>
          </div>
          <aside className="space-y-6 border-t bg-muted/20 p-5 sm:p-6 lg:border-t-0 lg:border-l">
            <section className="space-y-3">
              <h3 className="font-medium">{t("organization.extensions.details")}</h3>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("organization.extensions.author")}</dt>
                  <dd className="text-right font-medium">{item.developer}</dd>
                </div>
                {item.website && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("organization.extensions.website")}
                    </dt>
                    <dd className="min-w-0 text-right font-medium">
                      <ExternalLink
                        href={item.website}
                        label={formatWebsite(item.website)}
                      />
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t("organization.extensions.latestVersion")}</dt>
                  <dd className="text-right font-medium">{latest?.version ?? item.version}</dd>
                </div>
                {selectedRelease?.packageSizeBytes !== undefined && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("organization.extensions.size")}</dt>
                    <dd className="text-right font-medium">{formatBytes(selectedRelease.packageSizeBytes)}</dd>
                  </div>
                )}
                {entry?.publishedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("organization.extensions.published")}
                    </dt>
                    <dd className="text-right font-medium">
                      {formatDate(entry.publishedAt)}
                    </dd>
                  </div>
                )}
                {entry?.updatedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("organization.extensions.updated")}</dt>
                    <dd className="text-right font-medium">{formatDate(entry.updatedAt)}</dd>
                  </div>
                )}
                {selectedRelease?.publishedAt && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("organization.extensions.versionReleased")}
                    </dt>
                    <dd className="text-right font-medium">
                      {formatDate(selectedRelease.publishedAt)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("organization.extensions.pluginId")}
                  </dt>
                  <dd className="min-w-0 break-all text-right font-medium">
                    {item.id}
                  </dd>
                </div>
              </dl>
            </section>
            {item.keywords?.length ? (
              <section className="space-y-2.5">
                <h3 className="font-medium">{t("organization.extensions.keywords")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {item.keywords.map((keyword) => (
                    <Badge className="max-w-full truncate" key={keyword} variant="outline">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </section>
            ) : null}
            {links.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="font-medium">{t("organization.extensions.links")}</h3>
                <div className="flex flex-col items-start gap-2">
                  {links.map((link) => <ExternalLink {...link} key={link.label} />)}
                </div>
              </section>
            )}
          </aside>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-col rounded-b-xl px-5 sm:flex-row sm:items-center sm:px-6">
          {item.builtin ? (
            <div className="flex w-full items-center justify-end gap-2">
              <Badge variant="outline">{t("extensions.builtIn")}</Badge>
              <Button
                className={enabled ? "dark:text-foreground" : undefined}
                disabled={!canWrite || busy}
                onClick={() => onToggle(item.id, !enabled)}
                variant={enabled ? "destructive" : "default"}
              >
                {t(enabled ? "extensions.disableExtension" : "extensions.enableExtension")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex w-full flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
                {versions.length > 0 && (
                  <Select
                    disabled={busy}
                    onValueChange={(value) => value && setSelectedVersion(value)}
                    value={selectedVersion}
                  >
                    <SelectTrigger
                      aria-label={t("organization.extensions.version")}
                      className="w-full sm:w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((version) => (
                        <SelectItem key={version.version} value={version.version}>
                          {version.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedVersion && selectedVersion !== installedVersion && (
                  <Button
                    disabled={
                      !canWrite ||
                      !online ||
                      !item.catalogOnline ||
                      busy ||
                      !entry
                    }
                    onClick={() => onInstall(item, selectedVersion)}
                  >
                    {installedVersion
                      ? t("organization.extensions.changeVersion")
                      : t("organization.extensions.install")}
                  </Button>
                )}
              </div>
              {installedVersion && (
                <Button
                  className="dark:text-foreground"
                  disabled={!canWrite || busy}
                  onClick={() => onUninstall(item.id)}
                  variant="destructive"
                >
                  {t("organization.extensions.uninstall")}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExtensionsPanel() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const online = useOnlineStatus();
  const db = usePowerSync();
  const { workspace, workspaceId } = useCurrentWorkspace();
  const canWrite = usePermission(permission.content.write);
  const {
    allExtensionIds,
    applyRuntimeChange,
    bundledExtensionIds,
    defaultExtensionIds,
    extensionMetadata,
    runtimeRevisions = {},
  } = useExtensionRegistry();
  const rows = useWorkspaceExtensionsQuery(workspaceId);
  const registryQuery = useOrganizationExtensionRegistriesQuery(
    workspace?.organization_id ?? undefined,
  );
  const registries = useMemo<OrganizationExtensionRegistry[]>(
    () =>
      registryQuery.data?.length
        ? registryQuery.data
        : registryQuery.isLoading
          ? []
          : [{
            addedAt: "",
            addedBy: null,
            id: OFFICIAL_MARKETPLACE_ID,
            kind: "github",
            location: OFFICIAL_MARKETPLACE_LOCATION,
            manifestUrl: OFFICIAL_MARKETPLACE_MANIFEST_URL,
            official: true,
            organizationId: workspace?.organization_id ?? "",
            updatedAt: "",
          }],
    [workspace?.organization_id, registryQuery.data, registryQuery.isLoading],
  );
  const marketplaceQueries = useQueries({
    queries: registries.map((registry) =>
      extensionMarketplaceQueryOptions(platform.plugins, registry.manifestUrl),
    ),
  });
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const [pending, setPending] = useState<PendingInstall | null>(null);

  const enabledIds = useMemo(() => {
    if (!rows.data?.length) return new Set(defaultExtensionIds);
    return new Set(
      rows.data
        .filter((row) => Boolean(row.enabled))
        .flatMap((row) => (row.extension_id ? [row.extension_id] : [])),
    );
  }, [defaultExtensionIds, rows.data]);
  const installations = useMemo(
    () =>
      (rows.data ?? []).flatMap((row) => {
        const installation = toWorkspaceExtensionInstallation(row);
        return installation ? [installation] : [];
      }),
    [rows.data],
  );
  const installedById = useMemo(
    () => new Map(installations.map((item) => [item.extensionId, item])),
    [installations],
  );

  const items = useMemo(() => {
    const bundledIds = new Set(
      bundledExtensionIds.filter((id) => extensionMetadata[id]),
    );
    const result: StoreItem[] = bundledExtensionIds.flatMap((id) => {
      const metadata = extensionMetadata[id];
      if (!metadata) return [];
      return [{
        builtin: true,
        description: t(`extensions.catalog.${id}.description`, { defaultValue: metadata.description }),
        developer: metadata.developer,
        iconUrl: BUILTIN_EXTENSION_ICON_URLS[id],
        id,
        keywords: metadata.keywords,
        name: t(`extensions.catalog.${id}.name`, { defaultValue: metadata.name }),
        storeDetails: {
          ...BUILTIN_EXTENSION_STORE_DETAILS[id],
          longDescription: metadata.longDescription,
        },
        version: metadata.version,
        website: metadata.website,
      }];
    });
    const seen = new Set(bundledIds);
    marketplaceQueries.forEach((query, index) => {
      if (!query.data?.catalog.enabled) return;
      const registry = registries[index];
      if (!registry) return;
      for (const entry of query.data.catalog.extensions) {
        if (seen.has(entry.id)) {
          log.warn({
            action: "plugin.marketplace.conflict",
            outcome: "ignored",
            plugin: { id: entry.id },
          });
          continue;
        }
        seen.add(entry.id);
        result.push({
          builtin: false,
          catalogOnline: query.data.source === "network",
          description: entry.description,
          developer: entry.developer,
          entry,
          iconUrl: entry.iconUrl,
          id: entry.id,
          keywords: entry.keywords,
          name: entry.name,
          registryId: registry.id,
          storeDetails: entry,
          version: entry.latestVersion,
          website: entry.homepageUrl,
        });
      }
    });
    for (const installation of installations) {
      if (seen.has(installation.extensionId)) continue;
      seen.add(installation.extensionId);
      result.push({
        builtin: false,
        description: t("extensions.placeholder.unknown-release", { name: installation.extensionId }),
        developer: t("extensions.unknownDeveloper"),
        id: installation.extensionId,
        name: installation.extensionId,
        registryId: installation.registryId,
        version: installation.version,
      });
    }
    const needle = search.trim().toLowerCase();
    return needle
      ? result.filter((item) =>
          `${item.name} ${item.description} ${item.developer} ${item.keywords?.join(" ") ?? ""}`
            .toLowerCase()
            .includes(needle),
        )
      : result;
  }, [
    bundledExtensionIds,
    extensionMetadata,
    installations,
    marketplaceQueries,
    registries,
    search,
    t,
  ]);

  const mutate = useCallback(
    async (
      pluginId: string,
      request: () => Promise<"warning" | void>,
    ) => {
      setBusyId(pluginId);
      try {
        const outcome = await request();
        if (outcome === "warning") {
          toast.warning(t("organization.extensions.cleanupWarning"));
        } else {
          toast.success(t("organization.extensions.saved"));
        }
        return true;
      } catch (error) {
        log.error({
          action: "workspace.extension.change",
          error: parseError(error),
          outcome: "failure",
          plugin: { id: pluginId },
          workspace: { id: workspaceId },
        });
        toast.error(t("organization.extensions.saveFailed"));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [workspaceId, t],
  );

  const handleToggle = useCallback(
    async (pluginId: string, enabled: boolean) => {
      if (!canWrite) return;
      const service = createWorkspaceExtensionsService(db, workspaceId);
      const initialState = { defaultExtensionIds, knownExtensionIds: allExtensionIds };
      const saved = await mutate(pluginId, async () => {
        await service.setEnabled(pluginId, enabled, initialState);
        const change = {
          enabled,
          extensionId: pluginId,
          operation: enabled ? "enable" as const : "disable" as const,
          workspaceId,
          revision: runtimeRevisions[pluginId],
        };
        notifyWorkspaceExtensionsChanged(change);
        try {
          await applyRuntimeChange?.(change);
        } catch (error) {
          if (!enabled) {
            log.warn({
              action: "workspace.extension.deactivate",
              error: parseError(error),
              outcome: "partial_failure",
              plugin: { id: pluginId },
              workspace: { id: workspaceId },
            });
            return "warning";
          }
          await service.setEnabled(pluginId, false, initialState);
          const rollback = {
            enabled: false,
            extensionId: pluginId,
            operation: "disable" as const,
            workspaceId,
            revision: runtimeRevisions[pluginId],
          };
          notifyWorkspaceExtensionsChanged(rollback);
          await applyRuntimeChange?.(rollback).catch(() => undefined);
          throw error;
        }
      });
      if (!saved) return;
      posthog.capture("plugin_toggled", { plugin_id: pluginId, enabled });
    },
    [
      allExtensionIds,
      canWrite,
      db,
      defaultExtensionIds,
      mutate,
      applyRuntimeChange,
      workspaceId,
      runtimeRevisions,
    ],
  );

  const requestInstall = (item: StoreItem, version: string) => {
    if (
      !online ||
      !item.catalogOnline ||
      !item.entry ||
      !item.registryId
    ) {
      return;
    }
    setSelected(null);
    setPending({ item, version });
  };

  const install = async () => {
    const pendingInstall = pending;
    if (
      !canWrite ||
      !online ||
      !pendingInstall?.item.entry ||
      !pendingInstall.item.registryId
    ) {
      return;
    }
    const { item, version } = pendingInstall;
    const registryId = item.registryId;
    if (!registryId) return;
    const registry = registries.find(
      (candidate) => candidate.id === registryId,
    );
    if (!registry) return;
    const service = createWorkspaceExtensionsService(db, workspaceId);
    const previous = installedById.get(item.id);
    const saved = await mutate(item.id, async () => {
      const current = await extensionMarketplaceQueryOptions(
        platform.plugins,
        registry.manifestUrl,
      ).queryFn();
      if (current.source !== "network" || !current.catalog.enabled) {
        throw new Error("Extension marketplace is unavailable");
      }
      const entry = current.catalog.extensions.find(
        (candidate) => candidate.id === item.id,
      );
      const release = entry?.versions.find(
        (candidate) => candidate.version === version,
      );
      if (
        !release ||
        !isMarketplaceVersionCompatible(PLUGIN_API_SUPPORTED_VERSIONS, release)
      ) {
        throw new Error("Extension release is unavailable");
      }
      await service.install(
        item.id,
        {
          descriptor: release.descriptor,
          registryId,
          version,
        },
        { defaultExtensionIds, knownExtensionIds: allExtensionIds },
      );
      const change = {
        enabled: true,
        extensionId: item.id,
        operation: previous ? "upgrade" as const : "install" as const,
        workspaceId,
        revision: `${registryId}:${version}:${release.descriptor.sha256}`,
      };
      notifyWorkspaceExtensionsChanged(change);
      try {
        await applyRuntimeChange?.(change);
      } catch (error) {
        if (previous) {
          await service.restore(previous);
          const rollback = {
            enabled: previous.enabled,
            extensionId: item.id,
            operation: previous.enabled ? "upgrade" as const : "disable" as const,
            workspaceId,
            revision: `${previous.registryId}:${previous.version}:${previous.descriptorSha256 ?? "catalog"}`,
          };
          notifyWorkspaceExtensionsChanged(rollback);
          await applyRuntimeChange?.(rollback).catch(() => undefined);
        } else {
          await service.setEnabled(item.id, false, {
            defaultExtensionIds,
            knownExtensionIds: allExtensionIds,
          });
          const rollback = {
            enabled: false,
            extensionId: item.id,
            operation: "disable" as const,
            workspaceId,
            revision: change.revision,
          };
          notifyWorkspaceExtensionsChanged(rollback);
          await applyRuntimeChange?.(rollback).catch(() => undefined);
        }
        throw error;
      }
    });
    if (saved) {
      posthog.capture("plugin_installed", { plugin_id: item.id });
      setPending(null);
    }
  };

  const uninstall = async (pluginId: string) => {
    const saved = await mutate(pluginId, async () => {
      await createWorkspaceExtensionsService(db, workspaceId).uninstall(pluginId);
      const change = {
        enabled: false,
        extensionId: pluginId,
        operation: "uninstall" as const,
        workspaceId,
      };
      notifyWorkspaceExtensionsChanged(change);
      const outcome = await applyRuntimeChange?.(change).catch((error) => {
        log.warn({
          action: "workspace.extension.uninstall_cleanup",
          error: parseError(error),
          outcome: "partial_failure",
          plugin: { id: pluginId },
          workspace: { id: workspaceId },
        });
        return "warning" as const;
      });
      return outcome;
    });
    if (saved) {
      posthog.capture("plugin_uninstalled", { plugin_id: pluginId });
      setSelected(null);
    }
  };

  return (
    <div className="@container flex h-full w-full flex-col gap-5 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold">{t("extensions.title")}</h1>
      {!canWrite && (
        <Alert>
          <AlertTitle>{t("permissions.readOnlyTitle")}</AlertTitle>
          <AlertDescription>{t("permissions.readOnlyDescription")}</AlertDescription>
        </Alert>
      )}
      {!online && (
        <Alert>
          <AlertTitle>{t("organization.extensions.offlineTitle")}</AlertTitle>
          <AlertDescription>{t("extensions.offlineWorkspaceDescription")}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center">
        <InputGroup className="w-full @xl:max-w-sm">
          <InputGroupInput
            aria-label={t("organization.extensions.search")}
            className="[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("extensions.searchPlaceholder")}
            type="search"
            value={search}
          />
          {search && (
            <InputGroupButton onClick={() => setSearch("")}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </InputGroupButton>
          )}
        </InputGroup>
        <ExtensionIdeaDialog />
      </div>
      <div
        aria-busy={marketplaceQueries.some((query) => query.isPending)}
        aria-label={t("organization.extensions.availableExtensions")}
        className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3"
        role="list"
      >
        {marketplaceQueries.some((query) => query.isPending) &&
          marketplaceQueries.every((query) => !query.data) &&
          Array.from({ length: 3 }, (_, index) => (
            <div className="rounded-xl border p-4" key={index} role="listitem">
              <Skeleton className="h-28 w-full" />
            </div>
          ))}
        {items.map((item) => {
          const installation: WorkspaceExtensionInstallation | undefined =
            installedById.get(item.id);
          return (
            <div key={item.id} role="listitem">
              <ExtensionCard
                busy={busyId === item.id}
                canWrite={canWrite}
                enabled={enabledIds.has(item.id)}
                installedVersion={installation?.version}
                item={item}
                onInstall={requestInstall}
                onOpenDetails={setSelected}
                onToggle={(id, enabled) => void handleToggle(id, enabled)}
                onUninstall={(id) => void uninstall(id)}
                online={online}
              />
            </div>
          );
        })}
        {items.length === 0 && (
          <Empty className="border @xl:col-span-2 @4xl:col-span-3">
            <EmptyHeader>
              <EmptyMedia variant="icon"><HugeiconsIcon icon={Search01Icon} /></EmptyMedia>
              <EmptyTitle>{t("organization.extensions.noResults")}</EmptyTitle>
              <EmptyDescription>
                {t("organization.extensions.noResultsDescription", { search })}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <ExtensionDetailsDialog
        busy={busyId === selected?.id}
        canWrite={canWrite}
        enabled={selected ? enabledIds.has(selected.id) : false}
        installedVersion={selected ? installedById.get(selected.id)?.version : undefined}
        item={selected}
        onInstall={requestInstall}
        onOpenChange={(open) => !open && setSelected(null)}
        onToggle={(id, enabled) => void handleToggle(id, enabled)}
        onUninstall={(id) => void uninstall(id)}
        online={online}
      />
      <AlertDialog onOpenChange={(open) => !open && setPending(null)} open={Boolean(pending)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("organization.extensions.trustTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("organization.extensions.trustDescription", { name: pending?.item.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={Boolean(busyId)} onClick={() => void install()}>
              {t("organization.extensions.confirmInstall")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
