"use client";

import type { PluginIconSource } from "@lunarisapp/plugin-sdk";
import { usePreloadResourceRenderer } from "../../../extensions/use-preload-resource-renderer";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
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
  AiChat02Icon,
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
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { useCurrentWorkspace } from "../../workspace";
import {
  useAvailableResources,
  useWorkspaceResources,
} from "../../workspace-explorer";
import { useCreateRootResource } from "../../workspace-explorer/hooks/use-create-root-resource";
import { useAuth } from "@repo/features/auth";
import { useSearchAgentPrompt } from "../hooks/useSearchAgentPrompt";
import { permission } from "@repo/auth/permissions";
import { usePermission } from "@repo/features/permissions";
import type { CommandSearchResult } from "../types";
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
import {
  useSearchDialog,
  useSearchDialogStore,
} from "../hooks/useSearchDialog";
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
  getSearchMatchRank,
  matchesSearchPrefix,
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
  ranges?: Array<{ end: number; start: number }>
): ReactNode {
  if (ranges?.length) {
    const parts: ReactNode[] = [];
    let offset = 0;
    for (const [index, range] of ranges.entries()) {
      parts.push(text.slice(offset, range.start));
      parts.push(
        <mark
          className="rounded-sm bg-foreground/15 px-0.5 font-semibold text-foreground"
          key={`${range.start}-${range.end}-${index}`}
        >
          {text.slice(range.start, range.end)}
        </mark>
      );
      offset = range.end;
    }
    parts.push(text.slice(offset));
    return parts;
  }
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return text;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return text;
  }

  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + trimmedQuery.length);
  const after = text.slice(matchIndex + trimmedQuery.length);

  return (
    <>
      {before}
      <mark className="rounded-sm bg-foreground/15 px-0.5 font-semibold text-foreground">
        {match}
      </mark>
      {after}
    </>
  );
}

function ResultIcon({ icon }: { icon: PluginIconSource }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-4" icon={icon} />
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

const NO_COMMAND_ACTIONS: CommandActions = {};

export function SearchDialog({
  includeWorkbenchCommands = true,
}: {
  includeWorkbenchCommands?: boolean;
} = {}) {
  const { t } = useTranslation();
  const { workspace, workspaceId } = useCurrentWorkspace();
  const { data: session } = useAuth().useSession();
  const askAgent = useSearchAgentPrompt(
    workspace?.organization_id,
    session?.user.id
  );
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

  const canCreate = usePermission(permission.content.write);
  const resources = useAvailableResources();
  const createRootResource = useCreateRootResource();
  const createInContext = useSearchDialogStore(
    (state) => state.createResourceInContext
  );
  const resourceCommands = useMemo<CommandSearchResult[]>(
    () =>
      canCreate
        ? resources.map((type) => ({
            type: "command",
            id: `cmd-create-resource-${type.resourceTypeId}`,
            label: type.name,
            searchAlias: t("commands.createResource", { type: type.name }),
            icon: type.icon,
            action: () => (createInContext ?? createRootResource)(type),
          }))
        : [],
    [canCreate, resources, createInContext, createRootResource, t]
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
      onAskAgent={askAgent}
      commandActions={
        includeWorkbenchCommands ? commandActions : NO_COMMAND_ACTIONS
      }
      resourceCommands={resourceCommands}
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
  inline = false,
  onAskAgent,
  commandActions,
  resourceCommands,
  workspaceId = "",
  workspaceSlug: currentWorkspaceSlug = "",
  items = EMPTY_ITEMS,
  onOpenResource,
}: {
  inline?: boolean;
  onAskAgent?: (text: string) => void;
  commandActions: CommandActions;
  resourceCommands?: CommandSearchResult[];
  workspaceId?: string;
  workspaceSlug?: string;
  items?: ReturnType<typeof useWorkspaceResources>;
  onOpenResource?: (
    resourceId: string,
    title: string,
    pluginId: string
  ) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathWithRegion } = useRegion();
  const { organizationSlug } = useParams<{ organizationSlug: string }>();
  const {
    isOpen,
    query,
    open,
    close,
    dismiss,
    setQuery,
    createResourceInContext,
  } = useSearchDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inline && isOpen) {
      inputRef.current?.focus();
    }
  }, [inline, isOpen]);
  const choosingResource = Boolean(createResourceInContext);
  const searchQuery = choosingResource ? "" : query;
  const detectedFieldCompletion = useMemo(
    () => getSearchQueryFieldCompletion(searchQuery),
    [searchQuery]
  );
  const valueCompletion = useMemo(
    () => getSearchQueryValueCompletion(searchQuery),
    [searchQuery]
  );
  const fieldCompletion = valueCompletion ? null : detectedFieldCompletion;
  const fieldSuggestions = fieldCompletion?.fields ?? EMPTY_FIELD_SUGGESTIONS;
  const isCompleting = Boolean(fieldCompletion || valueCompletion);
  const isCompletingWorkspace = valueCompletion?.field === "workspace";
  const isCompletingResourceValue = Boolean(
    valueCompletion && valueCompletion.field !== "workspace"
  );
  const isQueryEmpty = !(choosingResource || query.trim());
  const resultsOpen = isOpen && !(inline && isQueryEmpty);
  const isShowingDefaultSuggestions = !inline && isQueryEmpty && !isCompleting;
  const executableQuery = isCompleting ? "" : searchQuery;
  const workspaceCandidates = useWorkspaceSearch(
    isCompletingWorkspace ? valueCompletion.value : executableQuery,
    {
      excludeCurrentWorkspace: isShowingDefaultSuggestions,
      includeAllWhenEmpty: isCompletingWorkspace || isShowingDefaultSuggestions,
      limit: isShowingDefaultSuggestions
        ? DEFAULT_WORKSPACE_SUGGESTION_LIMIT
        : undefined,
    }
  );
  const resourceCandidates = useResourceSearch(
    valueCompletion?.field === "title"
      ? valueCompletion.value
      : executableQuery,
    isCompletingResourceValue ? 100 : 150,
    { includeAllWhenEmpty: isCompletingResourceValue }
  );
  const contentResults = useResourceContentSearch(
    executableQuery,
    300,
    resultsOpen && !choosingResource && !(inline && isCompleting)
  );
  const resourceTypes = useSearchResourceTypes();

  useCommandHotkeys(commandActions);

  const commandCandidates = useCommandSearch(
    choosingResource ? query : executableQuery,
    choosingResource ? NO_COMMAND_ACTIONS : commandActions,
    resourceCommands
  );

  const { workspaceResults, resourceResults, commandResults } = useMemo(() => {
    const hasWordMatch = (result: { substringMatch?: boolean }) =>
      !result.substringMatch;
    const preferWordMatches =
      isCompleting ||
      contentResults.length > 0 ||
      workspaceCandidates.some(hasWordMatch) ||
      resourceCandidates.some(hasWordMatch) ||
      commandCandidates.some(hasWordMatch);
    return {
      workspaceResults: preferWordMatches
        ? workspaceCandidates.filter(hasWordMatch)
        : workspaceCandidates,
      resourceResults: preferWordMatches
        ? resourceCandidates.filter(hasWordMatch)
        : resourceCandidates,
      commandResults: preferWordMatches
        ? commandCandidates.filter(hasWordMatch)
        : commandCandidates,
    };
  }, [
    commandCandidates,
    contentResults.length,
    isCompleting,
    resourceCandidates,
    workspaceCandidates,
  ]);
  const showAgentResult =
    !!onAskAgent && !!query.trim() && !isCompleting && !choosingResource;
  const validResourceIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items]
  );

  const { recentFiles, addRecentFile } = useRecentFiles(workspaceId, {
    validResourceIds,
  });
  const [requestedValue, setSelectedValue] = useState("");

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
    if (!valueCompletion) {
      return EMPTY_VALUE_SUGGESTIONS;
    }

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
            getSearchMatchRank([left.label], valueCompletion.value) -
              getSearchMatchRank([right.label], valueCompletion.value) ||
            left.label.localeCompare(right.label)
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
          result.pluginId ? [result.pluginId] : []
        )
      ),
    ];
    if (valueCompletion.field === "extension") {
      const extensionIds = [
        ...new Set(
          searchResourceTypeIds.flatMap((resourceTypeId) => {
            const extensionId = resourceTypes.get(resourceTypeId)?.extensionId;
            return extensionId ? [extensionId] : [];
          })
        ),
      ];
      return extensionIds
        .filter((extensionId) => matchesSearchPrefix(extensionId, partial))
        .sort(
          (left, right) =>
            getSearchMatchRank([left], valueCompletion.value) -
              getSearchMatchRank([right], valueCompletion.value) ||
            left.localeCompare(right)
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
          matchesSearchPrefix(value, partial)
        )
      )
      .sort(
        (left, right) =>
          getSearchMatchRank(
            [left.resourceTypeId, left.name],
            valueCompletion.value
          ) -
            getSearchMatchRank(
              [right.resourceTypeId, right.name],
              valueCompletion.value
            ) || left.name.localeCompare(right.name)
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

  const firstCompletionValue =
    fieldCompletion && fieldSuggestions[0]
      ? `search-filter-${fieldSuggestions[0]}`
      : (valueSuggestions[0]?.id ?? "");

  useEffect(() => {
    setSelectedValue(firstCompletionValue);
  }, [firstCompletionValue, isOpen, query]);

  const uniqueContentResults = useMemo(
    () => filterDuplicateContentResults(contentResults, resourceResults),
    [contentResults, resourceResults]
  );

  const hasResults =
    showAgentResult ||
    workspaceResults.length > 0 ||
    resourceResults.length > 0 ||
    uniqueContentResults.length > 0 ||
    commandResults.length > 0;
  const hasRecent = recentFiles.length > 0;

  const groupedItems = useMemo(
    () => [
      ...buildSearchGroups({
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
      }),
      ...(showAgentResult
        ? [{ name: t("editor.agentWork"), items: ["ask-agent-work"] }]
        : []),
    ],
    [
      commandResults,
      resourceResults,
      hasRecent,
      showAgentResult,
      isQueryEmpty,
      workspaceResults,
      recentFiles,
      t,
      uniqueContentResults,
    ]
  );

  const selectedValue =
    isCompleting ||
    groupedItems.some((group) => group.items.includes(requestedValue))
      ? requestedValue
      : (groupedItems[0]?.items[0] ?? "");

  const highlightedResource =
    resourceResults.find((result) => result.id === selectedValue) ??
    uniqueContentResults.find((result) => result.id === selectedValue);
  const highlightedRecent = recentFiles.find(
    (file) => `recent-${file.resourceId}` === selectedValue
  );
  usePreloadResourceRenderer(
    resultsOpen && !isCompleting
      ? (highlightedResource?.pluginId ?? highlightedRecent?.pluginId)
      : undefined
  );

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
    if (!pluginId) {
      return;
    }
    posthog.capture("search_executed", { type: "resource" });
    if (resultWorkspaceId !== workspaceId) {
      if (!(workspaceSlug && organizationSlug)) {
        return;
      }
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
      if (!fieldCompletion) {
        return;
      }
      inputRef.current?.focus();
      setQuery(completeSearchQueryField(query, fieldCompletion, field));
    },
    [fieldCompletion, query, setQuery]
  );

  const completeValue = useCallback(
    (value: string) => {
      if (!valueCompletion) {
        return;
      }
      inputRef.current?.focus();
      setQuery(completeSearchQueryValue(query, valueCompletion, value));
    },
    [query, setQuery, valueCompletion]
  );

  const openFieldSuggestions = useCallback(() => {
    if (isCompleting) {
      return;
    }
    const separator = query && !/\s$/u.test(query) ? " " : "";
    setQuery(`${query}${separator}@`);
  }, [isCompleting, query, setQuery]);

  /** Completes a filter or cycles between result groups with Tab. */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Tab") {
        return;
      }

      if (fieldCompletion && !e.shiftKey) {
        const selectedField =
          fieldSuggestions.find(
            (field) => `search-filter-${field}` === selectedValue
          ) ?? fieldSuggestions[0];
        if (!selectedField) {
          return;
        }
        e.preventDefault();
        completeField(selectedField);
        return;
      }

      if (valueCompletion && !e.shiftKey) {
        const selectedSuggestion =
          valueSuggestions.find(
            (suggestion) => suggestion.id === selectedValue
          ) ?? valueSuggestions[0];
        if (!selectedSuggestion) {
          return;
        }
        e.preventDefault();
        completeValue(selectedSuggestion.value);
        return;
      }

      if (isCompleting || groupedItems.length <= 1) {
        return;
      }

      // Let keyboard focus leave the inline results and reach the composer controls.
      const boundary = e.shiftKey ? groupedItems[0] : groupedItems.at(-1);
      if (inline && boundary?.items.includes(selectedValue)) {
        return;
      }
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
      inline,
      isCompleting,
      selectedValue,
      valueCompletion,
      valueSuggestions,
    ]
  );

  const composer = inline && !choosingResource;
  const submitPrompt = () => {
    if (!(onAskAgent && query.trim())) {
      return;
    }
    onAskAgent(query.trim());
    close();
  };
  const filterButton = (
    <Button
      aria-expanded={isCompleting}
      aria-haspopup="listbox"
      aria-label={t("search.addFilterLabel")}
      className="text-muted-foreground"
      size="xs"
      variant="ghost"
      onClick={() => {
        if (!isOpen) {
          open();
        }
        inputRef.current?.focus();
        openFieldSuggestions();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
        }
      }}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <span aria-hidden="true" className="font-mono">
        @
      </span>
      <span className="hidden sm:inline">{t("search.addFilter")}</span>
    </Button>
  );
  const palette = (
    <Command
      className={
        inline
          ? "h-auto border bg-card p-0 text-card-foreground shadow-xs focus-within:border-ring [&_[data-slot=command-input-wrapper]]:p-0 [&_[data-slot=input-group]]:h-12 [&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent [&_[data-slot=input-group]]:shadow-none"
          : "pb-0"
      }
      label={
        choosingResource
          ? t("explorer.searchResourceTypes")
          : t("common.search")
      }
      loop
      onBlur={
        inline
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                dismiss();
              }
            }
          : undefined
      }
      onKeyDown={(event) => {
        if (inline && event.key === "Escape") {
          event.preventDefault();
          dismiss();
        } else if (inline && !isOpen && event.key === "ArrowDown") {
          event.preventDefault();
          open();
        } else if (event.target === inputRef.current && resultsOpen) {
          handleKeyDown(event);
        }
      }}
      onValueChange={setSelectedValue}
      shouldFilter={false}
      value={selectedValue}
    >
      <CommandInput
        ref={inputRef}
        data-testid={inline ? "workspaces-search" : "search-dialog-input"}
        asChild
        onFocus={inline && !isOpen ? open : undefined}
        onClick={inline && !isOpen ? open : undefined}
        endAdornment={!(composer || choosingResource) && filterButton}
        onValueChange={(value) => {
          if (inline && !isOpen) {
            open();
          }
          setQuery(value);
        }}
        placeholder={
          choosingResource
            ? t("explorer.searchResourceTypes")
            : inline
              ? t(onAskAgent ? "search.searchOrAsk" : "search.placeholder")
              : t("common.search")
        }
        value={query}
      >
        {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: cmdk supplies the combobox role through asChild. */}
        <input aria-expanded={resultsOpen} />
      </CommandInput>
      {!!composer && (
        <div className="flex justify-end px-2.5 pb-2.5">{filterButton}</div>
      )}
      {!!resultsOpen && (
        <>
          <CommandList className="max-h-[min(60vh,28rem)] scroll-py-2">
            {!!fieldCompletion && (
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
                        <span className="block truncate text-muted-foreground text-xs">
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
                      {!!suggestion.description && (
                        <span className="block truncate text-muted-foreground text-xs">
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
                className="py-12 text-center text-muted-foreground text-sm"
                role="status"
              >
                {t("search.noFilterValues")}
              </div>
            )}
            {!(isCompleting || hasResults || isQueryEmpty) && (
              <CommandEmpty className="py-12">
                <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <HugeiconsIcon className="size-5" icon={FileSearchIcon} />
                </span>
                <span className="font-medium">
                  {choosingResource
                    ? t("explorer.noMatchingTypes")
                    : t("search.noResults")}
                </span>
                {!choosingResource && (
                  <span className="mt-1 block text-muted-foreground text-xs">
                    {t("search.noResultsHint")}
                  </span>
                )}
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
                  if (!item) {
                    return null;
                  }
                  return (
                    <CommandItem
                      className="py-2"
                      key={`recent-${file.resourceId}`}
                      onSelect={() =>
                        handleResourceSelect(item.id, file.title, file.pluginId)
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
                className="border-border/60 border-t"
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
                    <ResultIcon icon={Folder01Icon} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {result.label}
                      </span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {result.slug}
                      </span>
                    </span>
                    {!!result.isCurrent && (
                      <Badge variant="secondary">
                        {t("search.currentWorkspace")}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!isCompleting && resourceResults.length > 0 && (
              <CommandGroup
                className="border-border/60 border-t"
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
                      <span className="block truncate text-muted-foreground text-xs">
                        {result.workspaceName}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!isCompleting && uniqueContentResults.length > 0 && (
              <CommandGroup
                className="border-border/60 border-t"
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
                    <ResultIcon icon={FileSearchIcon} />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate font-medium">
                        {result.label}
                      </span>
                      {!!result.preview && (
                        <span className="block truncate text-muted-foreground text-xs">
                          <span className="font-medium">
                            {result.workspaceName}
                          </span>
                          <span aria-hidden="true"> · </span>
                          {highlightMatch(
                            result.preview,
                            query,
                            result.previewHighlights
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
                className="border-border/60 border-t"
                heading={
                  <GroupHeading
                    count={commandResults.length}
                    label={
                      choosingResource
                        ? t("explorer.addResource")
                        : t("search.groupCommands")
                    }
                  />
                }
              >
                {commandResults.map((result) => (
                  <CommandItem
                    className="py-2"
                    key={result.id}
                    onSelect={() =>
                      handleCommandSelect(result.id, result.action)
                    }
                    value={result.id}
                  >
                    <ResultIcon icon={result.icon ?? Terminal} />
                    <span className="min-w-0 truncate font-medium">
                      {result.label}
                    </span>
                    {!!result.shortcut && (
                      <CommandShortcut>{result.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!showAgentResult && (
              <CommandItem
                value="ask-agent-work"
                className="m-1 py-2"
                onSelect={submitPrompt}
              >
                <ResultIcon icon={AiChat02Icon} />
                <span className="min-w-0 truncate font-medium">
                  {t("search.askAgent", { query: query.trim() })}
                </span>
              </CommandItem>
            )}
          </CommandList>
          {!composer && (
            <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-border/60 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Kbd>↑↓</Kbd>
                {t("search.hintNavigate")}
              </span>
              {!choosingResource && (
                <span className="flex items-center gap-1">
                  <Kbd>Tab</Kbd>
                  {isCompleting
                    ? t("search.hintComplete")
                    : t("search.hintGroups")}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1">
                <Kbd>↵</Kbd>
                {t("search.hintOpen")}
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd>
                {t("search.hintClose")}
              </span>
            </div>
          )}
        </>
      )}
    </Command>
  );

  if (inline) {
    return palette;
  }

  return (
    <CommandDialog
      className="top-[min(16dvh,8rem)] sm:max-w-2xl"
      description={t("search.description")}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={isOpen}
      title={choosingResource ? t("explorer.addResource") : t("search.title")}
    >
      {palette}
    </CommandDialog>
  );
}
