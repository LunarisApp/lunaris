import {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuTrigger,
} from "@lunarisapp/ui/blocks/responsive-dropdown-menu";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { HugeiconsIcon, Sorting01Icon, Tick02Icon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";
import type { WorkspacesSort } from "..";

const sortOptions = [
  { value: "activity", label: "workspaces.sortByActivity" },
  { value: "name", label: "workspaces.sortByName" },
] as const;

export function WorkspacesSortControl({
  onChange,
  value,
}: {
  onChange: (value: WorkspacesSort) => void;
  value: WorkspacesSort;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <ResponsiveDropdownMenu>
        <ResponsiveDropdownMenuTrigger
          render={
            <Button
              aria-label={t("workspaces.sortBy")}
              className="size-11 rounded-lg"
              data-testid="workspaces-sort"
              size="icon"
              variant="outline"
            />
          }
        >
          <HugeiconsIcon aria-hidden="true" icon={Sorting01Icon} />
        </ResponsiveDropdownMenuTrigger>
        <ResponsiveDropdownMenuContent title={t("workspaces.sortBy")}>
          {sortOptions.map((option) => (
            <ResponsiveDropdownMenuItem
              aria-pressed={value === option.value}
              className="min-h-12 rounded-xl text-base"
              data-testid={`workspaces-sort-${option.value}`}
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              <span className="flex-1">{t(option.label)}</span>
              {value === option.value ? (
                <HugeiconsIcon aria-hidden="true" icon={Tick02Icon} />
              ) : null}
            </ResponsiveDropdownMenuItem>
          ))}
        </ResponsiveDropdownMenuContent>
      </ResponsiveDropdownMenu>
    );
  }

  return (
    <Select
      onValueChange={(nextValue) => {
        if (nextValue === "name" || nextValue === "activity") {
          onChange(nextValue);
        }
      }}
      value={value}
    >
      <SelectTrigger
        aria-label={t("workspaces.sortBy")}
        className="w-36"
        data-testid="workspaces-sort"
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={Sorting01Icon}
          strokeWidth={2}
        />
        <SelectValue>
          {(selected: WorkspacesSort | null) =>
            t(
              sortOptions.find((option) => option.value === selected)?.label ??
                sortOptions[0].label
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {sortOptions.map((option) => (
          <SelectItem
            data-testid={`workspaces-sort-${option.value}`}
            key={option.value}
            value={option.value}
          >
            {t(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
