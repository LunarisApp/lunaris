import {
  type PluginEntityReferenceOption,
  useEntityReferenceSearch,
  useOrganizationNavigation,
} from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import {
  ArrowUpRight01Icon,
  File01Icon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResourcePropertyValue, PropertyValue } from "../types";
import {
  PropertyFieldButton,
  type PropertyFieldAppearance,
  PropertyPlaceholder,
  PropertyTypeIcon,
} from "./property-field-shared";
import {
  PropertyPickerClearAction,
  propertyPickerContentClassName,
  PropertyPickerList,
  PropertyPickerMessage,
  PropertyPickerOption,
} from "./property-picker";

interface ResourceFieldProps {
  appearance: PropertyFieldAppearance;
  className?: string;
  disabled: boolean;
  emptyLabel?: string;
  onValueChange: (value: PropertyValue | null) => void;
  propertyName: string;
  value: ResourcePropertyValue | undefined;
}

export function ResourceField({
  appearance,
  className,
  disabled,
  emptyLabel,
  onValueChange,
  propertyName,
  value,
}: ResourceFieldProps) {
  const { t } = useTranslation();
  const searchEntityReferences = useEntityReferenceSearch({ limit: 100 });
  const navigation = useOrganizationNavigation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{
    error: boolean;
    items: ResourceReferenceOption[];
    loading: boolean;
  }>({ error: false, items: [], loading: false });

  useEffect(() => {
    if (!open || disabled) return;
    let active = true;
    setSearch({ error: false, items: [], loading: true });
    const timeout = window.setTimeout(() => {
      void searchEntityReferences(query)
        .then((items) => {
          if (!active) return;
          setSearch({
            error: false,
            items: items.filter(isResourceReferenceOption),
            loading: false,
          });
        })
        .catch(() => {
          if (active) setSearch({ error: true, items: [], loading: false });
        });
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [disabled, open, query, searchEntityReferences]);

  const openResource = () => {
    if (!value) return;
    void navigation.openEntityReference({
      resourceId: value.resourceId,
      workspaceId: value.workspaceId,
      type: "workspace-resource",
    });
    setOpen(false);
  };
  const picker = (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        disabled={disabled && !value}
        render={
          <PropertyFieldButton
            appearance={appearance}
            aria-label={propertyName}
            className={cn(
              "h-7 min-w-28 max-w-64 justify-start px-2",
              className,
              appearance === "metadata" && value && "shrink"
            )}
          />
        }
      >
        {appearance === "composer" ? (
          <PropertyTypeIcon type="resource" />
        ) : null}
        {value ? (
          <ResourceValue showIcon={appearance === "control"} value={value} />
        ) : (
          <PropertyPlaceholder>
            {emptyLabel ??
              t(
                "extensions.catalog.lunaris.kanban.propertyPlaceholders.resource"
              )}
          </PropertyPlaceholder>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={propertyPickerContentClassName("resource")}
      >
        {disabled ? null : (
          <>
            <Input
              aria-label={t("extensions.catalog.lunaris.kanban.searchResources")}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("extensions.catalog.lunaris.kanban.searchResources")}
              type="search"
              value={query}
            />
            <PropertyPickerList>
              {search.items.map((item) => {
                const next = resourceValueFromOption(item);
                const selected =
                  value?.workspaceId === next.workspaceId &&
                  value.resourceId === next.resourceId;
                return (
                  <PropertyPickerOption
                    checked={selected}
                    key={`${next.workspaceId}:${next.resourceId}`}
                    onSelect={() => {
                      onValueChange(next);
                      setOpen(false);
                    }}
                  >
                    <HugeiconsIcon
                      className="shrink-0 text-muted-foreground"
                      icon={File01Icon}
                      size={16}
                      strokeWidth={2}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{next.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {next.workspaceName}
                      </span>
                    </span>
                  </PropertyPickerOption>
                );
              })}
              <ResourceSearchStatus search={search} />
            </PropertyPickerList>
          </>
        )}
        {value ? (
          <div className="flex items-center justify-between gap-2 border-t pt-2">
            <Button
              onClick={openResource}
              size="xs"
              variant="ghost"
            >
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={14}
                strokeWidth={2}
              />
              {t("extensions.catalog.lunaris.kanban.openResource")}
            </Button>
            {disabled ? null : (
              <PropertyPickerClearAction onClear={() => onValueChange(null)}>
                {t("extensions.catalog.lunaris.kanban.clear")}
              </PropertyPickerClearAction>
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );

  if (appearance !== "metadata" || !value) return picker;
  const openLabel = t("extensions.catalog.lunaris.kanban.openResource");
  return (
    <span className="flex max-w-full min-w-0 items-center gap-0.5">
      {picker}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={openLabel}
              className="shrink-0 text-muted-foreground"
              onClick={openResource}
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent>{openLabel}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function ResourceSearchStatus({
  search,
}: {
  search: { error: boolean; items: ResourceReferenceOption[]; loading: boolean };
}) {
  const { t } = useTranslation();
  if (search.loading) {
    return (
      <PropertyPickerMessage role="status">
        {t("extensions.catalog.lunaris.kanban.searchingResources")}
      </PropertyPickerMessage>
    );
  }
  if (search.error) {
    return (
      <PropertyPickerMessage className="text-destructive" role="alert">
        {t("extensions.catalog.lunaris.kanban.resourceSearchError")}
      </PropertyPickerMessage>
    );
  }
  if (search.items.length === 0) {
    return (
      <PropertyPickerMessage>
        {t("extensions.catalog.lunaris.kanban.noResourcesFound")}
      </PropertyPickerMessage>
    );
  }
  return null;
}

type ResourceReferenceOption = PluginEntityReferenceOption & {
    resourceTypeId: string;
    reference: { resourceId: string; workspaceId: string; type: "workspace-resource" };
  };

function isResourceReferenceOption(
  item: PluginEntityReferenceOption
): item is ResourceReferenceOption {
  return (
    item.kind === "resource" &&
    item.reference.type === "workspace-resource" &&
    item.resourceTypeId !== null
  );
}

function resourceValueFromOption(
  item: ResourceReferenceOption
): ResourcePropertyValue {
  return {
    resourceId: item.reference.resourceId,
    name: item.name,
    resourceTypeId: item.resourceTypeId,
    workspaceId: item.reference.workspaceId,
    workspaceName: item.workspaceName,
  };
}

function ResourceValue({
  showIcon,
  value,
}: {
  showIcon: boolean;
  value: ResourcePropertyValue;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2" title={value.name}>
      {showIcon ? (
        <HugeiconsIcon
          className="shrink-0 text-muted-foreground"
          icon={File01Icon}
          size={16}
          strokeWidth={2}
        />
      ) : null}
      <span className="truncate text-sm">{value.name}</span>
    </span>
  );
}
