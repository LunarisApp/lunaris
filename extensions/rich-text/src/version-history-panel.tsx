"use client";

import {
  type PluginUser,
  type ResourceStorageHandle,
  useApiTransport,
  useCurrentUser,
  useYjsStorageLastEdited,
  useLocale,
  useOrgMembersMap,
  useYjsStorageUpdateRows,
} from "@lunarisapp/plugin-sdk";
import {
  formatAbsoluteTime,
  formatRelativeTime,
} from "@lunarisapp/plugin-sdk/time";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { useGravatarUrl } from "@lunarisapp/ui/hooks/use-gravatar-url";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  HugeiconsIcon,
  Time01Icon,
} from "@lunarisapp/ui/icons";
import { startTransition, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildRichTextVersionHistory,
  type RichTextVersionHistoryEntry,
} from "./version-history";

const MAX_VISIBLE_DIFF_LINES = 12;

export function RichTextVersionHistoryPanel({
  storage,
  onClose,
}: {
  storage: ResourceStorageHandle;
  resourceId?: string;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { baseUrl: apiBaseUrl } = useApiTransport();
  const { user: currentUser } = useCurrentUser();
  const { map: membersMap } = useOrgMembersMap();
  const loadYjsStorageUpdateRows = useYjsStorageUpdateRows();
  const { isLoading: isLastEditedLoading, lastEditedAt } =
    useYjsStorageLastEdited(storage);
  const [entries, setEntries] = useState<RichTextVersionHistoryEntry[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const lastLoadedEditedAtRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    hasLoadedRef.current = false;
    lastLoadedEditedAtRef.current = null;
    activeRequestIdRef.current += 1;
    setEntries([]);
    setError(null);
    setIsInitialLoading(true);
    setIsRefreshing(false);
  }, [storage.storageId]);

  useEffect(() => {
    const lastEditedKey = lastEditedAt?.toISOString() ?? null;
    if (
      hasLoadedRef.current &&
      (isLastEditedLoading || lastEditedKey === lastLoadedEditedAtRef.current)
    ) {
      return;
    }

    const requestId = activeRequestIdRef.current + 1;
    const isInitialRequest = !hasLoadedRef.current;
    activeRequestIdRef.current = requestId;

    if (isInitialRequest) {
      setIsInitialLoading(true);
      setError(null);
    } else {
      setIsRefreshing(true);
    }

    const refreshHistory = async () => {
      try {
        const updates = await loadYjsStorageUpdateRows(storage);
        const nextEntries = buildRichTextVersionHistory(updates);

        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        hasLoadedRef.current = true;
        lastLoadedEditedAtRef.current = updates.at(-1)?.createdAt ?? null;
        startTransition(() => {
          setEntries(nextEntries);
          setError(null);
          setIsInitialLoading(false);
          setIsRefreshing(false);
        });
      } catch (nextError) {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setError(
            nextError instanceof Error
              ? nextError
              : new Error(String(nextError))
          );
          setIsInitialLoading(false);
          setIsRefreshing(false);
        });
      }
    };

    void refreshHistory();
  }, [storage, isLastEditedLoading, lastEditedAt, loadYjsStorageUpdateRows]);

  return (
    <aside
      aria-label={t("common.versionHistory")}
      className="absolute @3xl:relative @3xl:inset-auto inset-y-3 right-3 @3xl:z-auto z-20 @3xl:m-3 @3xl:ml-0 flex @3xl:w-80 w-[calc(100%-1.5rem)] max-w-80 shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground"
      data-testid="rich-text-version-history"
    >
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="font-semibold text-sm leading-5">
            {t("common.versionHistory")}
          </h2>
          {lastEditedAt ? (
            <p className="text-muted-foreground text-xs leading-4">
              {t("editor.edited") +
                " " +
                formatRelativeTime(lastEditedAt, locale, t)}
            </p>
          ) : null}
        </div>
        {onClose ? (
          <Button
            aria-label={t("extensions.catalog.lunaris.rich-text.history.close")}
            className="-mt-1 -mr-1"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {error ? (
          <PanelError
            description={error.message}
            title={t("extensions.catalog.lunaris.rich-text.history.errorTitle")}
            variant="error"
          />
        ) : isInitialLoading ? (
          <VersionHistorySkeleton />
        ) : entries.length === 0 ? (
          <Empty className="border-0 px-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Time01Icon} />
              </EmptyMedia>
              <EmptyTitle>
                {t("extensions.catalog.lunaris.rich-text.history.emptyTitle")}
              </EmptyTitle>
              <EmptyDescription>
                {t(
                  "extensions.catalog.lunaris.rich-text.history.emptyDescription"
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="divide-y">
              {entries.map((entry) => (
                <details
                  className="group py-3 first:pt-0 last:pb-0"
                  key={entry.id}
                >
                  <summary className="-mx-2 flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ActorBadge
                          actorId={entry.actorId}
                          apiBaseUrl={apiBaseUrl}
                          currentUser={currentUser}
                          members={membersMap}
                          t={t}
                        />
                        <span className="text-muted-foreground text-xs">
                          {formatAbsoluteTime(
                            new Date(entry.endedAt),
                            locale,
                            t
                          )}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant="secondary">
                          +{entry.addedCount}{" "}
                          {t(
                            "extensions.catalog.lunaris.rich-text.history.added"
                          )}
                        </Badge>
                        <Badge variant="outline">
                          -{entry.removedCount}{" "}
                          {t(
                            "extensions.catalog.lunaris.rich-text.history.removed"
                          )}
                        </Badge>
                      </div>
                    </div>
                    <HugeiconsIcon
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      icon={ArrowDown01Icon}
                      strokeWidth={2}
                    />
                  </summary>
                  <div className="mt-2.5 ml-1 space-y-1 border-l pl-3 font-mono text-xs">
                    {entry.lines
                      .slice(0, MAX_VISIBLE_DIFF_LINES)
                      .map((line, index) => (
                        <div
                          className={
                            line.kind === "added"
                              ? "break-words text-emerald-700 dark:text-emerald-400"
                              : "break-words text-rose-700 dark:text-rose-400"
                          }
                          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed placeholders or stateless rows; position is the intended identity.
                          key={`${entry.id}-${index}`}
                        >
                          {line.kind === "added" ? "+" : "-"} {line.text}
                        </div>
                      ))}
                    {entry.lines.length > MAX_VISIBLE_DIFF_LINES ? (
                      <p className="pt-1 font-sans text-muted-foreground text-xs">
                        {t(
                          "extensions.catalog.lunaris.rich-text.history.moreLines",
                          {
                            count: entry.lines.length - MAX_VISIBLE_DIFF_LINES,
                          }
                        )}
                      </p>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
            {isRefreshing ? (
              <div className="sr-only">Refreshing history</div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function VersionHistorySkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="space-y-2 py-3 first:pt-0 last:pb-0"
          // biome-ignore lint/suspicious/noArrayIndexKey: Fixed placeholders or stateless rows; position is the intended identity.
          key={index}
        >
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

function ActorBadge({
  actorId,
  apiBaseUrl,
  currentUser,
  members,
  t,
}: {
  actorId: string | null;
  apiBaseUrl: string;
  currentUser: PluginUser | undefined;
  members: Map<string, PluginUser>;
  t: TranslateFn;
}) {
  const resolved = resolveActor(actorId, currentUser, members, t);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ExtensionUserAvatar apiBaseUrl={apiBaseUrl} user={resolved.user} />
      <span className="truncate font-medium text-sm">{resolved.label}</span>
    </span>
  );
}

function ExtensionUserAvatar({
  apiBaseUrl,
  user,
}: {
  apiBaseUrl: string;
  user?: PluginUser;
}) {
  const label = user?.name?.trim() || user?.email?.trim() || "?";
  const uploadedAvatarUrl = getUploadedAvatarUrl(apiBaseUrl, user);
  const gravatarUrl = useGravatarUrl(user?.email, 48);
  const avatarUrl = uploadedAvatarUrl ?? gravatarUrl;
  return (
    <Avatar data-testid={`avatar-${user?.id ?? "none"}`} size="sm">
      {avatarUrl ? <AvatarImage alt={label} src={avatarUrl} /> : null}
      <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function getUploadedAvatarUrl(
  apiBaseUrl: string,
  user: PluginUser | undefined
): string | undefined {
  if (!user?.image) {
    return undefined;
  }

  if (!user.id) {
    return user.image;
  }

  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/v1/account/avatar/${encodeURIComponent(user.id)}`;
}

function resolveActor(
  actorId: string | null,
  currentUser: PluginUser | undefined,
  members: Map<string, PluginUser>,
  t: TranslateFn
): { user: PluginUser | undefined; label: string } {
  if (!actorId) {
    return {
      user: undefined,
      label: t("extensions.catalog.lunaris.rich-text.history.system"),
    };
  }

  if (actorId === currentUser?.id) {
    return {
      user: currentUser,
      label: t("extensions.catalog.lunaris.rich-text.history.you"),
    };
  }

  const member = members.get(actorId);
  if (member) {
    return {
      user: member,
      label:
        member.name ||
        member.email ||
        t("extensions.catalog.lunaris.rich-text.history.collaborator", {
          id: actorId.slice(0, 8),
        }),
    };
  }

  return {
    user: { id: actorId },
    label: t("extensions.catalog.lunaris.rich-text.history.collaborator", {
      id: actorId.slice(0, 8),
    }),
  };
}
