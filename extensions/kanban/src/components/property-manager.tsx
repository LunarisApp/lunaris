import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@lunarisapp/ui/components/collapsible";
import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerSwatch,
  ColorPickerTrigger,
} from "@lunarisapp/ui/components/color-picker";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Kanban,
  KanbanColumnContent,
  type KanbanCommitMeta,
  KanbanItem,
  KanbanItemHandle,
} from "@lunarisapp/ui/components/kanban";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Edit02Icon,
  HugeiconsIcon,
  PropertyAddIcon,
  Settings02Icon,
} from "@lunarisapp/ui/icons";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Doc, Map as YMap } from "yjs";
import { LABEL_COLORS } from "../constants";
import { createId } from "../create-id";
import { useYArray, useYMapJson } from "../hooks";
import {
  normalizePropertyType,
  parsePropertyOptions,
} from "../property-codec";
import {
  markPropertiesInitialized,
  movePropertyDefinition,
  orderPropertyMaps,
} from "../property-state";
import { PROPERTY_TYPE_ICONS } from "../property-type-icon";
import { clearTaskPropertyAssignments } from "../task-assignments";
import type { PropertyOption, PropertyType } from "../types";

interface PropertyManagerProps {
  yDoc: Doc;
}

interface PropertyManagerItem {
  id: string;
  map: YMap<string>;
}

const PROPERTY_COLUMN_ID = "property-manager";

export function PropertyManager({ yDoc }: PropertyManagerProps) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const { items, add, remove } = useYArray(yDoc, "properties");
  const propertyMaps = orderPropertyMaps(items);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const propertyItems = propertyMaps.map((map, index) => ({
    id: map.get("id") || `property:${index}`,
    map,
  }));

  const handleAddProperty = (type: PropertyType) => {
    const id = createId("prop");
    const definition: Record<string, string> = {
      id,
      name: b("newProperty"),
      type,
    };
    if (type === "select" || type === "multi-select") {
      definition.options = JSON.stringify([]);
    }
    yDoc.transact(() => {
      markPropertiesInitialized(yDoc);
      add(definition);
    });
    setEditingPropertyId(id);
    setIsAdding(false);
  };

  const removeProperty = (propertyMap: YMap<string>) => {
    const index = items.indexOf(propertyMap);
    if (index < 0) return;
    yDoc.transact(() => {
      markPropertiesInitialized(yDoc);
      clearTaskPropertyAssignments(yDoc, propertyMap.get("id") ?? "");
      remove(index);
    });
  };

  const handlePropertyOrderCommit = useCallback(
    (
      _value: Record<string, PropertyManagerItem[]>,
      meta: KanbanCommitMeta<PropertyManagerItem>
    ) => {
      if (meta.kind !== "item") return;
      yDoc.transact(() => {
        markPropertiesInitialized(yDoc);
        movePropertyDefinition(
          yDoc.getArray<YMap<string>>("properties"),
          meta.activeIndex,
          meta.overIndex
        );
      });
    },
    [yDoc]
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  aria-label={b("manageProperties")}
                  size="icon-xs"
                  variant="ghost"
                />
              }
            />
          }
        >
          <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent>{b("manageProperties")}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="max-h-[min(36rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] max-w-(--available-width) gap-0 overflow-hidden p-0"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2.5">
          <PopoverHeader className="min-w-0">
            <PopoverTitle className="truncate">{b("properties")}</PopoverTitle>
          </PopoverHeader>
          <Button
            aria-expanded={isAdding}
            onClick={() => setIsAdding((value) => !value)}
            size="sm"
            variant={isAdding ? "secondary" : "ghost"}
          >
            <HugeiconsIcon
              icon={isAdding ? Cancel01Icon : PropertyAddIcon}
              size={14}
              strokeWidth={2}
            />
            {isAdding ? t("common.cancel") : b("addProperty")}
          </Button>
        </header>
        {isAdding ? (
          <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-1 border-b bg-muted/35 p-2">
            {PROPERTY_TYPE_ORDER.map((type) => (
              <Button
                className="min-w-0 justify-start"
                key={type}
                onClick={() => handleAddProperty(type)}
                size="sm"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="text-muted-foreground"
                  icon={PROPERTY_TYPE_ICONS[type]}
                  size={14}
                  strokeWidth={2}
                />
                <span className="truncate">{b(`propertyTypes.${type}`)}</span>
              </Button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-2.5">
          {propertyMaps.length > 0 ? (
            <Kanban<PropertyManagerItem>
              getItemValue={getPropertyManagerItemId}
              onValueChange={ignorePropertyPreview}
              onValueCommit={handlePropertyOrderCommit}
              restoreOnCancel
              value={{ [PROPERTY_COLUMN_ID]: propertyItems }}
            >
              <KanbanColumnContent
                className="gap-0 divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70"
                value={PROPERTY_COLUMN_ID}
              >
                {propertyItems.map(({ id, map: pMap }) => (
                  <KanbanItem
                    className="bg-popover data-[dragging=true]:relative data-[dragging=true]:z-10 data-[dragging=true]:bg-muted"
                    key={id}
                    value={id}
                  >
                    <PropertyEditor
                      initiallyEditing={pMap.get("id") === editingPropertyId}
                      onDelete={() => removeProperty(pMap)}
                      propertyMap={pMap}
                      yDoc={yDoc}
                    />
                  </KanbanItem>
                ))}
              </KanbanColumnContent>
            </Kanban>
          ) : isAdding ? null : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
              {b("noProperties")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PropertyEditor({
  initiallyEditing,
  propertyMap,
  onDelete,
  yDoc,
}: {
  initiallyEditing: boolean;
  propertyMap: YMap<string>;
  onDelete: () => void;
  yDoc: Doc;
}) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const [name, setName] = useState(() => propertyMap.get("name") ?? "");
  const [isEditing, setIsEditing] = useState(initiallyEditing);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const nameBeforeEdit = useRef(name);
  const [storedOptions, setStoredOptions] = useYMapJson<unknown>(
    propertyMap,
    "options",
    []
  );
  const options = parsePropertyOptions(storedOptions);
  const setOptions = (next: PropertyOption[]) => setStoredOptions(next);
  const [newOptionName, setNewOptionName] = useState("");
  const type = normalizePropertyType(propertyMap.get("type"));
  const hasOptions = type === "select" || type === "multi-select";

  const commitName = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(nameBeforeEdit.current);
      setIsEditing(false);
      return;
    }
    propertyMap.set("name", trimmed);
    setName(trimmed);
    setIsEditing(false);
  }, [propertyMap, name]);

  const startEditing = useCallback(() => {
    nameBeforeEdit.current = name;
    setIsEditing(true);
  }, [name]);

  const cancelEditing = useCallback(() => {
    setName(nameBeforeEdit.current);
    setIsEditing(false);
  }, []);

  const addOption = () => {
    if (!newOptionName.trim()) return;
    const option: PropertyOption = {
      id: createId("opt"),
      name: newOptionName.trim(),
      color:
        LABEL_COLORS[options.length % LABEL_COLORS.length] ?? LABEL_COLORS[0],
    };
    setOptions([...options, option]);
    setNewOptionName("");
  };

  const removeOption = (id: string) => {
    yDoc.transact(() => {
      clearTaskPropertyAssignments(
        yDoc,
        propertyMap.get("id") ?? "",
        id,
        type === "multi-select"
      );
      setOptions(options.filter((o) => o.id !== id));
    });
  };

  const renameOption = (id: string, newName: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, name: newName } : o)));
  };

  const changeColor = (id: string, color: string) => {
    setOptions(options.map((o) => (o.id === id ? { ...o, color } : o)));
  };

  if (!type) return null;

  return (
    <>
      <Collapsible
        className="group/property"
        defaultOpen={hasOptions && options.length === 0}
      >
        <div className="flex min-h-11 items-center gap-2 px-2 py-1.5">
          <KanbanItemHandle
            render={
              <Button
                aria-label={t(
                  "extensions.catalog.lunaris.kanban.reorderProperty",
                  { name }
                )}
                className="shrink-0 text-muted-foreground"
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon
              icon={DragDropVerticalIcon}
              size={14}
              strokeWidth={2}
            />
          </KanbanItemHandle>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <HugeiconsIcon
              icon={PROPERTY_TYPE_ICONS[type]}
              size={14}
              strokeWidth={2}
            />
          </span>
          {isEditing ? (
            <Input
              aria-label={b("propertyName")}
              autoFocus
              className="h-8 min-w-0 flex-1 text-sm"
              onBlur={commitName}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName();
                if (e.key === "Escape") cancelEditing();
              }}
              value={name}
            />
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {b(`propertyTypes.${type}`)}
              </span>
            </span>
          )}
          {hasOptions ? (
            <CollapsibleTrigger
              aria-label={name}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <HugeiconsIcon
                className="transition-transform data-closed:-rotate-90"
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={2}
              />
            </CollapsibleTrigger>
          ) : null}
          {isEditing ? null : (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={b("editPropertyName")}
                      className="text-muted-foreground"
                      onClick={startEditing}
                      size="icon-sm"
                      variant="ghost"
                    />
                  }
                >
                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent>{b("editName")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label={b("deleteProperty")}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                      size="icon-sm"
                      variant="ghost"
                    />
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent>{b("deleteProperty")}</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
        {hasOptions ? (
          <CollapsibleContent className="relative mb-2 ml-8 mr-2 space-y-2 pb-1 pl-2 pr-1 pt-0.5">
            <div className="space-y-0.5">
              {options.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {b("noOptions")}
                </p>
              ) : null}
              {options.map((option) => (
                <OptionRow
                  key={option.id}
                  onColorChange={(color) => changeColor(option.id, color)}
                  onRemove={() => removeOption(option.id)}
                  onRename={(name) => renameOption(option.id, name)}
                  option={option}
                />
              ))}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 border-t border-border/50 pt-2">
              <Input
                aria-label={b("newOptionName")}
                className="h-8 min-w-0 text-xs"
                onChange={(e) => setNewOptionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOption();
                }}
                placeholder={b("newOption")}
                value={newOptionName}
              />
              <Button
                disabled={!newOptionName.trim()}
                onClick={addOption}
                size="sm"
                variant="ghost"
              >
                {b("add")}
              </Button>
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={b("deleteProperty")}
        confirmVariant="destructive"
        description={t(
          "extensions.catalog.lunaris.kanban.deletePropertyConfirmation",
          { name }
        )}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
        }}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={b("deleteProperty")}
      />
    </>
  );
}

const PROPERTY_TYPE_ORDER: readonly PropertyType[] = [
  "select",
  "multi-select",
  "people",
  "resource",
  "date",
  "text",
  "number",
  "checkbox",
];

function getPropertyManagerItemId(item: PropertyManagerItem): string {
  return item.id;
}

function ignorePropertyPreview(): void {
  // DnD Kit workspaces sortable positions without mutating Yjs until drop.
}

function OptionRow({
  option,
  onColorChange,
  onRemove,
  onRename,
}: {
  option: PropertyOption;
  onColorChange: (color: string) => void;
  onRemove: () => void;
  onRename: (name: string) => void;
}) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const [isEditing, setIsEditing] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [editName, setEditName] = useState(option.name);
  const nameBeforeEdit = useRef(option.name);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditName(nameBeforeEdit.current);
      setIsEditing(false);
      return;
    }
    onRename(trimmed);
    setEditName(trimmed);
    setIsEditing(false);
  };

  const startEditing = () => {
    nameBeforeEdit.current = option.name;
    setEditName(option.name);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditName(nameBeforeEdit.current);
    setIsEditing(false);
  };

  return (
    <>
      <div className="group/option flex min-h-9 items-center gap-1 rounded-md px-1">
        <ColorPicker
          modal={false}
          onValueChange={onColorChange}
          value={option.color}
        >
          <ColorPickerTrigger
            aria-label={t(
              "extensions.catalog.lunaris.kanban.changeOptionColor",
              { name: option.name }
            )}
            className="size-8 shrink-0 cursor-pointer p-0"
            size="icon"
            variant="ghost"
          >
            <span
              className="size-4 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: option.color }}
            />
          </ColorPickerTrigger>
          <ColorPickerContent className="w-[min(17.5rem,calc(100vw-2rem))] max-w-(--available-width)">
            <ColorPickerArea />
            <ColorPickerHueSlider />
            <div className="flex items-center gap-2">
              <ColorPickerSwatch />
              <ColorPickerInput withoutAlpha />
            </div>
          </ColorPickerContent>
        </ColorPicker>
        {isEditing ? (
          <Input
            aria-label={t("extensions.catalog.lunaris.kanban.renameOption", {
              name: option.name,
            })}
            autoFocus
            className="h-8 min-w-0 flex-1 text-xs"
            onBlur={commitRename}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelEditing();
            }}
            value={editName}
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs">{option.name}</span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t(
                      "extensions.catalog.lunaris.kanban.renameOption",
                      { name: option.name }
                    )}
                    className="text-muted-foreground"
                    onClick={startEditing}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={2} />
              </TooltipTrigger>
              <TooltipContent>{b("editName")}</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t(
                  "extensions.catalog.lunaris.kanban.removeNamedOption",
                  { name: option.name }
                )}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setRemoveOpen(true)}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
          </TooltipTrigger>
          <TooltipContent>{b("removeOption")}</TooltipContent>
        </Tooltip>
      </div>
      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={b("removeOption")}
        confirmVariant="destructive"
        description={t(
          "extensions.catalog.lunaris.kanban.removeOptionConfirmation",
          { name: option.name }
        )}
        onConfirm={() => {
          setRemoveOpen(false);
          onRemove();
        }}
        onOpenChange={setRemoveOpen}
        open={removeOpen}
        title={b("removeOption")}
      />
    </>
  );
}
