"use client";

import {
  type PluginIconSource,
} from "@lunarisapp/plugin-sdk";
import { usePreloadResourceRenderer } from "../../../extensions/use-preload-resource-renderer";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@lunarisapp/ui/components/command";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import {
  File01Icon,
  FileSearchIcon,
  Folder01Icon,
  HugeiconsIcon,
  InputTextIcon,
  Layers01Icon,
  PuzzleIcon,
  Terminal,
  Time01Icon,
} from "@lunarisapp/ui/icons";
import posthog from "posthog-js";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { useCurrentWorkspace } from "../../workspace";
import { useWorkspaceResources } from "../../workspace-explorer";
import { useRegion } from "@repo/features/region";
import {
  useOrganizationNavigation,
  useOrganizationViewState,
} from "../../organization-navigation";
import { createCommandActions } from "../command-actions";
import { filterDuplicateContentResults } from "../content-search";
import type { CommandActions } from "../command-results";
import { useCommandSearch } from "../hooks/useCommandSearch";
import { useCommandHotkeys } from "../hooks/useCommandHotkeys";
import { useResourceContentSearch } from "../hooks/useResourceContentSearch";
import { useResourceSearch } from "../hooks/useResourceSearch";
import { useWorkspaceSearch } from "../hooks/useWorkspaceSearch";
import { useRecentFiles } from "../hooks/useRecentFiles";
import { useSearchDialog } from "../hooks/useSearchDialog";
import { useSearchResourceTypes } from "../hooks/useSearchResourceTypes";
import {
  buildSearchGroups,
  getNextGroupItemValue,
} from "../search-dialog-model";
import {
  completeSearchQueryField,
  completeSearchQueryValue,
  getSearchQueryFieldCompletion,
  getSearchQueryValueCompletion,
  normalizeSearchQuery,
  type SearchQueryField,
} from "../query";

/**
 * Highlights matching text in a preview string.
 * Returns React nodes with highlighted portions wrapped in <mark>.
 */
function highlightMatch(
  text: string,
  query: string,
  ranges?: Array<{ end: number; start: number }>,
): ReactNode {
  if (ranges?.length) {
    const parts: ReactNode[] = [];
    let offset = 0;
    for (const [index, range] of ranges.entries()) {
      parts.push(text.slice(offset, range.start));
      parts.push(
        <mark
          className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded-sm px-0.5"
          key={`${range.start}-${range.end}-${index}`}
        >
          {text.slice(range.start, range.end)}
        </mark>,
      );
      offset = range.end;
    }
    parts.push(text.slice(offset));
    return parts;
  }
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) return text;

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

function ResultIcon({
  icon,
  tone = "neutral",
}: {
  icon: PluginIconSource;
  tone?: "command" | "content" | "neutral" | "workspace";
}) {
  const toneClassName = {
    command: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    content: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    neutral: "bg-muted text-muted-foreground",
    workspace: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  }[tone];

  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${toneClassName}`}
    >
      <Icon className="size-4" icon={icon} strokeWidth={2} />
    </span>
  );
}

function GroupHeading({ count, label }: { count: number; label: string }) {
  return (
    <span className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
    </span>
  );
}

const EMPTY_FIELD_SUGGESTIONS: SearchQueryField[] = [];
const EMPTY_VALUE_SUGGESTIONS: FilterValueSuggestion[] = [];
const DEFAULT_WORKSPACE_SUGGESTION_LIMIT = 3;
const MAX_VALUE_SUGGESTIONS = 10;

interface FilterValueSuggestion {
  description?: string;
  icon: PluginIconSource;
  id: string;
  label: string;
  value: string;
}

function getSuggestionRank(values: string[], query: string): number {
  const needle = normalizeSearchQuery(query);
  if (!needle) return 0;
  return Math.min(
    ...values.map((value) => {
      const normalizedValue = normalizeSearchQuery(value);
      if (normalizedValue === needle) return 0;
      if (normalizedValue.startsWith(needle)) return 1;
      if (normalizedValue.includes(needle)) return 2;
      return 3;
    }),
  );
}

export function SearchDialog() {
  const { t } = useTranslation();
  const { workspace, workspaceId } = useCurrentWorkspace();
  const items = useWorkspaceResources();
  const {
    closeViewInstances,
    openExplorer,
    openResource,
    openTool,
    requestRenameActiveResource,
    toggleFocusMode,
  } = useOrganizationNavigation();
  const { activeViewInstanceId } = useOrganizationViewState();
  const activeResourceId = useMemo(
    () =>
      activeViewInstanceId &&
      items.some((item) => item.id === activeViewInstanceId)
        ? activeViewInstanceId
        : null,
    [activeViewInstanceId, items]
  );

  const commandActions = useMemo(
    () =>
      createCommandActions({
        activeResourceId,
        activeViewInstanceId,
        closeViewInstances,
        openExplorer,
        openTool,
        requestRenameActiveResource,
        t,
        toggleFocusMode,
      }),
    [
      activeResourceId,
      activeViewInstanceId,
      closeViewInstances,
      openExplorer,
      openTool,
      requestRenameActiveResource,
      t,
      toggleFocusMode,
    ]
  );

  return (
    <SearchDialogMenu
      commandActions={commandActions}
      workspaceId={workspaceId}
      workspaceSlug={workspace?.slug ?? ""}
      items={items}
      onOpenResource={(resourceId, title, pluginId) => {
        const resource = items.find((item) => item.id === resourceId);
        openResource({
          resourceId,
          resourceTypeId: pluginId,
          title,
          parentId: resource?.parent_id ?? null,
          schemaVersion: resource?.schema_version ?? 1,
        });
      }}
    />
  );
}

const EMPTY_ITEMS: ReturnType<typeof useWorkspaceResources> = [];

/** Shared palette; route adapters supply commands and local resource navigation. */
export function SearchDialogMenu({
  commandActions,
  workspaceId = "",
  workspaceSlug: currentWorkspaceSlug = "",
  items = EMPTY_ITEMS,
  onOpenResource,
}: {
  commandActions: CommandActions;
  workspaceId?: string;
  workspaceSlug?: string;
  items?: ReturnType<typeof useWorkspaceResources>;
  onOpenResource?: (resourceId: string, title: string, pluginId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathWithRegion } = useRegion();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const { isOpen, query, close, setQuery } = useSearchDialog();
  const detectedFieldCompletion = useMemo(
    () => getSearchQueryFieldCompletion(query),
    [query],
  );
  const valueCompletion = useMemo(
    () => getSearchQueryValueCompletion(query),
    [query],
  );
  const fieldCompletion = valueCompletion ? null : detectedFieldCompletion;
  const fieldSuggestions = fieldCompletion?.fields ?? EMPTY_FIELD_SUGGESTIONS;
  const isCompleting = Boolean(fieldCompletion || valueCompletion);
  const isCompletingWorkspace = valueCompletion?.field === "workspace";
  const isCompletingResourceValue = Boolean(
    valueCompletion && valueCompletion.field !== "workspace",
  );
  const isQueryEmpty = !query.trim();
  const isShowingDefaultSuggestions = isQueryEmpty && !isCompleting;
  const executableQuery = isCompleting ? "" : query;
  const workspaceResults = useWorkspaceSearch(
    isCompletingWorkspace ? valueCompletion.value : executableQuery,
    {
      excludeCurrentWorkspace: isShowingDefaultSuggestions,
      includeAllWhenEmpty: isCompletingWorkspace || isQueryEmpty,
      limit: isShowingDefaultSuggestions
        ? DEFAULT_WORKSPACE_SUGGESTION_LIMIT
        : undefined,
    },
  );
  const resourceResults = useResourceSearch(
    valueCompletion?.field === "title"
      ? valueCompletion.value
      : executableQuery,
    isCompletingResourceValue ? 100 : 150,
    { includeAllWhenEmpty: isCompletingResourceValue },
  );
  const contentResults = useResourceContentSearch(executableQuery, 300, isOpen);
  const resourceTypes = useSearchResourceTypes();

  useCommandHotkeys(commandActions);

  const commandResults = useCommandSearch(executableQuery, commandActions);

  const validResourceIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items]
  );

  const { recentFiles, addRecentFile } = useRecentFiles(workspaceId, {
    validResourceIds,
  });
  const [selectedValue, setSelectedValue] = useState("");

  const fieldDetails = {
    workspace: {
      description: t("search.filterWorkspaceDescription"),
      icon: Folder01Icon,
      label: t("search.filterWorkspace"),
    },
    title: {
      description: t("search.filterTitleDescription"),
      icon: InputTextIcon,
      label: t("search.filterTitle"),
    },
    extension: {
      description: t("search.filterExtensionDescription"),
      icon: PuzzleIcon,
      label: t("search.filterExtension"),
    },
    "resource-type": {
      description: t("search.filterResourceTypeDescription"),
      icon: Layers01Icon,
      label: t("search.filterResourceType"),
    },
  } satisfies Record<
    SearchQueryField,
    { description: string; icon: PluginIconSource; label: string }
  >;

  const valueSuggestions = useMemo<FilterValueSuggestion[]>(() => {
    if (!valueCompletion) return EMPTY_VALUE_SUGGESTIONS;

    if (valueCompletion.field === "workspace") {
      return workspaceResults.slice(0, MAX_VALUE_SUGGESTIONS).map((result) => ({
        description: result.slug,
        icon: Folder01Icon,
        id: `search-filter-value-workspace-${result.workspaceId}`,
        label: result.label,
        value: result.label,
      }));
    }

    if (valueCompletion.field === "title") {
      const seen = new Set<string>();
      return [...resourceResults]
        .sort(
          (left, right) =>
            getSuggestionRank([left.label], valueCompletion.value) -
              getSuggestionRank([right.label], valueCompletion.value) ||
            left.label.localeCompare(right.label),
        )
        .flatMap((result) => {
          const normalizedTitle = normalizeSearchQuery(result.label);
          if (seen.has(normalizedTitle) || seen.size >= MAX_VALUE_SUGGESTIONS) {
            return [];
          }
          seen.add(normalizedTitle);
          return [
            {
              description: result.workspaceName,
              icon: File01Icon,
              id: `search-filter-value-title-${result.resourceId}`,
              label: result.label,
              value: result.label,
            },
          ];
        });
    }

    const partial = normalizeSearchQuery(valueCompletion.value);
    const searchResourceTypeIds = [
      ...new Set(
        resourceResults.flatMap((result) =>
          result.pluginId ? [result.pluginId] : [],
        ),
      ),
    ];
    if (valueCompletion.field === "extension") {
      const extensionIds = [
        ...new Set(
          searchResourceTypeIds.flatMap((resourceTypeId) => {
            const extensionId = resourceTypes.get(resourceTypeId)?.extensionId;
            return extensionId ? [extensionId] : [];
          }),
        ),
      ];
      return extensionIds
        .filter((extensionId) =>
          normalizeSearchQuery(extensionId).includes(partial),
        )
        .sort(
          (left, right) =>
            getSuggestionRank([left], valueCompletion.value) -
              getSuggestionRank([right], valueCompletion.value) ||
            left.localeCompare(right),
        )
        .slice(0, MAX_VALUE_SUGGESTIONS)
        .map((extensionId) => ({
          icon: PuzzleIcon,
          id: `search-filter-value-extension-${extensionId}`,
          label: extensionId,
          value: extensionId,
        }));
    }

    return searchResourceTypeIds
      .map((resourceTypeId) => ({
        name: resourceTypes.get(resourceTypeId)?.name ?? resourceTypeId,
        resourceTypeId,
      }))
      .filter(({ name, resourceTypeId }) =>
        [resourceTypeId, name].some((value) =>
          normalizeSearchQuery(value).includes(partial),
        ),
      )
      .sort(
        (left, right) =>
          getSuggestionRank(
            [left.resourceTypeId, left.name],
            valueCompletion.value,
          ) -
            getSuggestionRank(
              [right.resourceTypeId, right.name],
              valueCompletion.value,
            ) ||
          left.name.localeCompare(right.name),
      )
      .slice(0, MAX_VALUE_SUGGESTIONS)
      .map(({ name, resourceTypeId }) => ({
        description: resourceTypeId,
        icon: Layers01Icon,
        id: `search-filter-value-resource-type-${resourceTypeId}`,
        label: name,
        value: resourceTypeId,
      }));
  }, [resourceResults, workspaceResults, resourceTypes, valueCompletion]);

  const firstCompletionValue = fieldCompletion
    ? fieldSuggestions[0]
      ? `search-filter-${fieldSuggestions[0]}`
      : ""
    : (valueSuggestions[0]?.id ?? "");

  useEffect(() => {
    setSelectedValue(firstCompletionValue);
  }, [firstCompletionValue, isOpen, query]);

  const uniqueContentResults = useMemo(
    () => filterDuplicateContentResults(contentResults, resourceResults),
    [contentResults, resourceResults]
  );

  const highlightedResource =
    resourceResults.find((result) => result.id === selectedValue) ??
    uniqueContentResults.find((result) => result.id === selectedValue);
  const highlightedRecent = recentFiles.find(
    (file) => `recent-${file.resourceId}` === selectedValue
  );
  usePreloadResourceRenderer(
    isOpen && !isCompleting
      ? (highlightedResource?.pluginId ?? highlightedRecent?.pluginId)
      : undefined
  );

  const hasResults =
    workspaceResults.length > 0 ||
    resourceResults.length > 0 ||
    uniqueContentResults.length > 0 ||
    commandResults.length > 0;
  const hasRecent = recentFiles.length > 0;

  const groupedItems = useMemo(() => {
    return buildSearchGroups({
      commandResults,
      resourceResults,
      hasRecent,
      isQueryEmpty,
      labels: {
        commands: t("search.groupCommands"),
        contentMatches: t("search.groupContentMatches"),
        resources: t("search.groupResources"),
        workspaces: t("search.groupWorkspaces"),
        recent: t("search.groupRecent"),
      },
      workspaceResults,
      recentFiles,
      uniqueContentResults,
    });
  }, [
    commandResults,
    resourceResults,
    hasRecent,
    isQueryEmpty,
    workspaceResults,
    recentFiles,
    t,
    uniqueContentResults,
  ]);

  const handleWorkspaceSelect = (slug: string, isCurrent: boolean) => {
    posthog.capture("search_executed", { type: "workspace" });
    if (!(isCurrent || !organizationSlug)) {
      navigate(pathWithRegion(`/${organizationSlug}/${slug}`));
    }
    close();
  };

  const handleResourceSelect = (
    resourceId: string,
    title: string,
    pluginId?: string,
    resultWorkspaceId = workspaceId,
    workspaceSlug = currentWorkspaceSlug
  ) => {
    // Only open items with known pluginId
    if (!pluginId) return;
    posthog.capture("search_executed", { type: "resource" });
    if (resultWorkspaceId !== workspaceId) {
      if (!(workspaceSlug && organizationSlug)) return;
      navigate(
        pathWithRegion(`/${organizationSlug}/${workspaceSlug}/${resourceId}`)
      );
      close();
      return;
    }
    addRecentFile(resourceId, title, pluginId);
    onOpenResource?.(resourceId, title, pluginId);
    close();
  };

  const handleCommandSelect = (commandId: string, action: () => void) => {
    posthog.capture("command_executed", { command_id: commandId });
    action();
    close();
  };

  const completeField = useCallback(
    (field: SearchQueryField) => {
      if (!fieldCompletion) return;
      setQuery(completeSearchQueryField(query, fieldCompletion, field));
    },
    [fieldCompletion, query, setQuery],
  );

  const completeValue = useCallback(
    (value: string) => {
      if (!valueCompletion) return;
      setQuery(completeSearchQueryValue(query, valueCompletion, value));
    },
    [query, setQuery, valueCompletion],
  );

  const openFieldSuggestions = useCallback(() => {
    if (isCompleting) return;
    const separator = query && !/\s$/u.test(query) ? " " : "";
    setQuery(`${query}${separator}@`);
  }, [isCompleting, query, setQuery]);

  /** Completes a filter or cycles between result groups with Tab. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") return;

      if (fieldCompletion && !e.shiftKey) {
        const selectedField =
          fieldSuggestions.find(
            (field) => `search-filter-${field}` === selectedValue,
          ) ?? fieldSuggestions[0];
        if (!selectedField) return;
        e.preventDefault();
        completeField(selectedField);
        return;
      }

      if (valueCompletion && !e.shiftKey) {
        const selectedSuggestion =
          valueSuggestions.find(
            (suggestion) => suggestion.id === selectedValue,
          ) ?? valueSuggestions[0];
        if (!selectedSuggestion) return;
        e.preventDefault();
        completeValue(selectedSuggestion.value);
        return;
      }

      if (isCompleting || groupedItems.length <= 1) return;

      e.preventDefault();

      const nextValue = getNextGroupItemValue(
        groupedItems,
        selectedValue,
        e.shiftKey ? "previous" : "next"
      );
      if (nextValue) {
        setSelectedValue(nextValue);
      }
    },
    [
      completeField,
      completeValue,
      fieldCompletion,
      fieldSuggestions,
      groupedItems,
      isCompleting,
      selectedValue,
      valueCompletion,
      valueSuggestions,
    ],
  );

  return (
    <CommandDialog
      className="sm:max-w-2xl"
      description={t("search.description")}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={isOpen}
      title={t("search.title")}
    >
      <Command
        className="pb-0 *:data-[slot=command-input-wrapper]:px-2 *:data-[slot=command-input-wrapper]:pt-1 *:data-[slot=command-input-wrapper]:pb-2"
        onKeyDown={handleKeyDown}
        onValueChange={setSelectedValue}
        shouldFilter={false}
        value={selectedValue}
      >
        <CommandInput
          data-testid="search-dialog-input"
          endAdornment={
            <button
              aria-controls="search-dialog-results"
              aria-expanded={isCompleting}
              aria-haspopup="listbox"
              aria-label={t("search.addFilterLabel")}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={openFieldSuggestions}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <span aria-hidden="true" className="font-mono">
                @
              </span>
              <span className="hidden sm:inline">{t("search.addFilter")}</span>
            </button>
          }
          onValueChange={setQuery}
          placeholder={t("search.placeholder")}
          value={query}
        />
        <CommandList
          className="max-h-[min(60vh,28rem)] scroll-py-2"
          id="search-dialog-results"
        >
          {fieldCompletion && (
            <CommandGroup
              heading={
                <GroupHeading
                  count={fieldSuggestions.length}
                  label={t("search.groupFilters")}
                />
              }
            >
              {fieldSuggestions.map((field) => {
                const details = fieldDetails[field];
                return (
                  <CommandItem
                    className="py-2"
                    key={field}
                    onSelect={() => completeField(field)}
                    value={`search-filter-${field}`}
                  >
                    <ResultIcon icon={details.icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {details.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {details.description}
                      </span>
                    </span>
                    <code className="hidden shrink-0 rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground sm:block">
                      @{field}:
                    </code>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {valueCompletion && valueSuggestions.length > 0 && (
            <CommandGroup
              heading={
                <GroupHeading
                  count={valueSuggestions.length}
                  label={fieldDetails[valueCompletion.field].label}
                />
              }
            >
              {valueSuggestions.map((suggestion) => (
                <CommandItem
                  className="py-2"
                  key={suggestion.id}
                  onSelect={() => completeValue(suggestion.value)}
                  value={suggestion.id}
                >
                  <ResultIcon icon={suggestion.icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {suggestion.label}
                    </span>
                    {suggestion.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.description}
                      </span>
                    )}
                  </span>
                  {suggestion.value !== suggestion.label && (
                    <code className="hidden max-w-48 shrink-0 truncate rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground sm:block">
                      {suggestion.value}
                    </code>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {valueCompletion && valueSuggestions.length === 0 && (
            <div
              className="py-12 text-center text-sm text-muted-foreground"
              role="status"
            >
              {t("search.noFilterValues")}
            </div>
          )}
          {!isCompleting && !hasResults && !isQueryEmpty && (
            <CommandEmpty className="py-12">
              <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <HugeiconsIcon className="size-5" icon={FileSearchIcon} />
              </span>
              <span className="font-medium">{t("search.noResults")}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("search.noResultsHint")}
              </span>
            </CommandEmpty>
          )}
          {!isCompleting && isQueryEmpty && hasRecent && (
            <CommandGroup
              heading={
                <GroupHeading
                  count={recentFiles.length}
                  label={t("search.groupRecent")}
                />
              }
            >
              {recentFiles.map((file) => {
                const item = items.find((i) => i.id === file.resourceId);
                if (!item) return null;
                return (
                  <CommandItem
                    className="py-2"
                    key={`recent-${file.resourceId}`}
                    onSelect={() =>
                      handleResourceSelect(
                        item.id,
                        file.title,
                        file.pluginId
                      )
                    }
                    value={`recent-${file.resourceId}`}
                  >
                    <ResultIcon icon={Time01Icon} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {file.title}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {!isCompleting && workspaceResults.length > 0 && (
            <CommandGroup
              className="border-t border-border/60"
              heading={
                <GroupHeading
                  count={workspaceResults.length}
                  label={t("search.groupWorkspaces")}
                />
              }
            >
              {workspaceResults.map((result) => (
                <CommandItem
                  className="py-2"
                  key={result.id}
                  onSelect={() =>
                    handleWorkspaceSelect(result.slug, result.isCurrent)
                  }
                  value={result.id}
                >
                  <ResultIcon icon={Folder01Icon} tone="workspace" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {result.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.slug}
                    </span>
                  </span>
                  {result.isCurrent && (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                      {t("search.currentWorkspace")}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!isCompleting && resourceResults.length > 0 && (
            <CommandGroup
              className="border-t border-border/60"
              heading={
                <GroupHeading
                  count={resourceResults.length}
                  label={t("search.groupResources")}
                />
              }
            >
              {resourceResults.map((result) => (
                <CommandItem
                  className="py-2"
                  key={result.id}
                  onSelect={() =>
                    handleResourceSelect(
                      result.resourceId,
                      result.label,
                      result.pluginId,
                      result.workspaceId,
                      result.workspaceSlug
                    )
                  }
                  value={result.id}
                >
                  <ResultIcon icon={File01Icon} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {result.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.workspaceName}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!isCompleting && uniqueContentResults.length > 0 && (
            <CommandGroup
              className="border-t border-border/60"
              heading={
                <GroupHeading
                  count={uniqueContentResults.length}
                  label={t("search.groupContentMatches")}
                />
              }
            >
              {uniqueContentResults.map((result) => (
                <CommandItem
                  className="py-2"
                  key={result.id}
                  onSelect={() =>
                    handleResourceSelect(
                      result.resourceId,
                      result.label,
                      result.pluginId,
                      result.workspaceId,
                      result.workspaceSlug
                    )
                  }
                  value={result.id}
                >
                  <ResultIcon icon={FileSearchIcon} tone="content" />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate font-medium">
                      {result.label}
                    </span>
                    {result.preview && (
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-medium">
                          {result.workspaceName}
                        </span>
                        <span aria-hidden="true"> · </span>
                        {highlightMatch(
                          result.preview,
                          query,
                          result.previewHighlights,
                        )}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!isCompleting && commandResults.length > 0 && (
            <CommandGroup
              className="border-t border-border/60"
              heading={
                <GroupHeading
                  count={commandResults.length}
                  label={t("search.groupCommands")}
                />
              }
            >
              {commandResults.map((result) => (
                <CommandItem
                  className="py-2"
                  key={result.id}
                  onSelect={() => handleCommandSelect(result.id, result.action)}
                  value={result.id}
                >
                  <ResultIcon
                    icon={result.icon ?? Terminal}
                    tone="command"
                  />
                  <span className="font-medium">{result.label}</span>
                  {result.shortcut && (
                    <CommandShortcut>{result.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Kbd>↑↓</Kbd>
            {t("search.hintNavigate")}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Tab</Kbd>
            {isCompleting
              ? t("search.hintComplete")
              : t("search.hintGroups")}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>↵</Kbd>
            {t("search.hintOpen")}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Esc</Kbd>
            {t("search.hintClose")}
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
