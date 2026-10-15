"use client";

import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import { ConfirmationDialog } from "@lunarisapp/ui/blocks/confirmation-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import { Checkbox } from "@lunarisapp/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  ArrowLeft01Icon,
  Delete02Icon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { permission } from "@repo/auth/permissions";
import { useWorkspaceResourceTrashRootsQuery } from "@repo/data/features/workspace-resources";
import { log, parseError } from "evlog";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePermission } from "@repo/features/permissions";
import { useCurrentWorkspace } from "../../workspace";
import { useWorkspaceActions } from "../store";
import { resolveWorkspaceResourceIcon } from "../types";

export function WorkspaceTrashPanel() {
  const { i18n, t } = useTranslation();
  const { workspaceId } = useCurrentWorkspace();
  const { data: roots } = useWorkspaceResourceTrashRootsQuery(workspaceId);
  const resourceTypes = useResourceTypes();
  const { purgeResources, restoreResources } = useWorkspaceActions();
  const canRestore = usePermission(permission.content.write);
  const canPurge = usePermission(permission.content.delete);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"purge" | "restore" | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const selectedIds = [...selected];
  const allSelected = roots.length > 0 && selected.size === roots.length;
  const selectedHasExpired = roots.some(
    (root) =>
      selected.has(root.id) &&
      (!root.purge_at || Date.parse(root.purge_at) <= Date.now()),
  );
  const resourceTypeIcons = useMemo(
    () =>
      new Map(
        resourceTypes.map((resource) => [resource.resourceTypeId, resource.icon]),
      ),
    [resourceTypes],
  );

  useEffect(() => {
    const available = new Set(roots.map(({ id }) => id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [roots]);

  const runAction = async (action: "purge" | "restore") => {
    if (selectedIds.length === 0) return;
    setBusy(action);
    try {
      if (action === "restore") await restoreResources(selectedIds);
      else await purgeResources(selectedIds);
      setSelected(new Set());
      toast.success(t(action === "restore" ? "trash.restored" : "trash.purged"));
    } catch (error) {
      log.error({
        tag: "WorkspaceTrash",
        msg: `${action} failed`,
        error: parseError(error),
        workspaceId,
        resourceIds: selectedIds,
      });
      toast.error(t(action === "restore" ? "trash.restoreFailed" : "trash.purgeFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="trash-title"
      className="flex h-full min-h-0 flex-col"
      data-testid="workspace-trash-panel"
    >
      <header className="border-b px-4 py-3">
        <h1 className="text-sm font-semibold" id="trash-title">
          {t("trash.title")}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("trash.description")}
        </p>
      </header>

      {roots.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Delete02Icon} />
            </EmptyMedia>
            <EmptyTitle>{t("trash.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("trash.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-4 py-2">
            <Checkbox
              aria-label={t("trash.selectAll")}
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked ? new Set(roots.map(({ id }) => id)) : new Set())
              }
            />
            <span className="text-xs text-muted-foreground">
              {t("trash.selectAll")}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {roots.map((root) => {
                const icon = resolveWorkspaceResourceIcon({
                  item: root,
                  resourceIcon: root.resource_type_id
                    ? resourceTypeIcons.get(root.resource_type_id)
                    : undefined,
                });
                const purgeTime = root.purge_at ? Date.parse(root.purge_at) : 0;
                const trashedOn = root.trashed_at
                  ? new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: "medium",
                    }).format(new Date(root.trashed_at))
                  : "";
                const deadline = purgeTime > Date.now()
                  ? new Intl.DateTimeFormat(i18n.language, {
                      dateStyle: "medium",
                    }).format(new Date(purgeTime))
                  : t("trash.expired");
                return (
                  <li data-testid="workspace-trash-item" key={root.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60 has-focus-visible:ring-2 has-focus-visible:ring-ring">
                      <Checkbox
                        aria-label={t("trash.selectResource", {
                          name: root.name || t("common.untitled"),
                        })}
                        checked={selected.has(root.id)}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked) next.add(root.id);
                            else next.delete(root.id);
                            return next;
                          })
                        }
                      />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        {icon ? <Icon className="size-4" icon={icon} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {root.name || t("common.untitled")}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t("trash.deletedOn", { date: trashedOn })}
                          {` · ${t("trash.deletesOn", { date: deadline })}`}
                          {root.descendant_count > 0
                            ? ` · ${t("trash.descendantCount", { count: root.descendant_count })}`
                            : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
          <footer className="flex shrink-0 justify-end gap-2 border-t p-3">
            <Button
              disabled={
                !canRestore ||
                selected.size === 0 ||
                selectedHasExpired ||
                busy !== null
              }
              onClick={() => void runAction("restore")}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} />
              {t("trash.restore")}
            </Button>
            <Button
              disabled={!canPurge || selected.size === 0 || busy !== null}
              onClick={() => setConfirmPurge(true)}
              size="sm"
              variant="destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} />
              {t("trash.deleteNow")}
            </Button>
          </footer>
        </>
      )}

      <ConfirmationDialog
        cancelLabel={t("common.cancel")}
        confirmLabel={t("trash.deleteNow")}
        confirmVariant="destructive"
        description={t("trash.purgeConfirmation", { count: selected.size })}
        onConfirm={() => void runAction("purge")}
        onOpenChange={setConfirmPurge}
        open={confirmPurge}
        title={t("trash.purgeTitle")}
      />
    </section>
  );
}
