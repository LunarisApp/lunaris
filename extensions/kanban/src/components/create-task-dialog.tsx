import {
  type PluginUser,
  useCurrentUser,
  useOrgMembersMap,
} from "@lunarisapp/plugin-sdk";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@lunarisapp/ui/components/dialog";
import { Input } from "@lunarisapp/ui/components/input";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import { Textarea } from "@lunarisapp/ui/components/textarea";
import {
  Add01Icon,
  ArrowRight01Icon,
  HugeiconsIcon,
  Task01Icon,
} from "@lunarisapp/ui/icons";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { PropertyDefinition, PropertyValue } from "../types";
import { PropertyValueField } from "./property-value-field";

export interface CreateTaskInput {
  description: string;
  name: string;
  propertyValues: Readonly<Record<string, PropertyValue>>;
}

interface CreateTaskDialogProps {
  boardName: string;
  initialPropertyValues: Readonly<Record<string, PropertyValue>>;
  onCreate: (input: CreateTaskInput) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  properties: PropertyDefinition[];
}

type CreateError = "item-limit" | "unknown";

function getCreateError(error: unknown): CreateError {
  return error instanceof Error && error.name === "ResourceCapacityExceededError"
    ? "item-limit"
    : "unknown";
}

export function CreateTaskDialog({
  boardName,
  initialPropertyValues,
  onCreate,
  onOpenChange,
  open,
  properties,
}: CreateTaskDialogProps) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const { user: currentUser } = useCurrentUser();
  const { map: members } = useOrgMembersMap();
  const people = useMemo(() => {
    const result = new Map<string, PluginUser>(members);
    if (currentUser?.id) result.set(currentUser.id, currentUser);
    return result;
  }, [currentUser, members]);
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [propertyValues, setPropertyValues] = useState<
    Record<string, PropertyValue>
  >({});
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<CreateError | null>(null);
  const createErrorId = useId();

  useEffect(() => {
    if (!open) return;
    setPropertyValues({ ...initialPropertyValues });
  }, [initialPropertyValues, open]);

  const reset = () => {
    setTaskName("");
    setDescription("");
    setPropertyValues({});
    setCreateError(null);
    setIsCreating(false);
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const name = taskName.trim();
    if (!name || isCreating) return;
    setCreateError(null);
    setIsCreating(true);
    try {
      const created = await onCreate({
        description: description.trim(),
        name,
        propertyValues,
      });
      if (created) changeOpen(false);
      else setCreateError("unknown");
    } catch (error) {
      setCreateError(getCreateError(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={2} />
            {b("addTask")}
          </Button>
        }
      />
      <DialogContent className="max-h-[min(42rem,var(--available-height))] w-[min(52rem,calc(100vw-2rem))] max-w-(--available-width) gap-0 overflow-hidden p-0 sm:max-w-[min(52rem,var(--available-width))]">
        <form
          className="flex min-h-[min(20rem,var(--available-height))] flex-col"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement &&
              event.target.dataset.taskTitle !== "true"
            ) {
              event.preventDefault();
            }
          }}
          onSubmit={submit}
        >
          <header className="flex min-w-0 items-center gap-2 px-4 pt-4 pr-12 pb-2 sm:px-5">
            <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-muted/70 px-2 py-1 text-sm text-muted-foreground">
              <HugeiconsIcon
                className="shrink-0"
                icon={Task01Icon}
                size={15}
                strokeWidth={2}
              />
              <span className="truncate">{boardName || b("untitled")}</span>
            </span>
            <HugeiconsIcon
              className="shrink-0 text-muted-foreground/70"
              icon={ArrowRight01Icon}
              size={14}
              strokeWidth={2}
            />
            <DialogTitle className="truncate text-sm leading-6">
              {b("newTask")}
            </DialogTitle>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
            <Input
              aria-describedby={createError ? createErrorId : undefined}
              aria-label={b("taskName")}
              autoFocus
              className="h-auto rounded-none border-0 bg-transparent px-0 py-4 text-xl font-semibold shadow-none ring-0 placeholder:font-semibold focus-visible:border-transparent focus-visible:ring-0 md:text-xl dark:bg-transparent"
              data-task-title="true"
              disabled={isCreating}
              maxLength={120}
              onChange={(event) => setTaskName(event.target.value)}
              placeholder={b("taskName")}
              value={taskName}
            />

            <Textarea
              aria-label={b("fields.description")}
              className="min-h-24 flex-1 resize-none border-0 bg-transparent px-0 py-1 text-base leading-6 shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              disabled={isCreating}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={b("placeholders.description")}
              value={description}
            />

            {createError ? (
              <p
                className="text-sm text-destructive"
                id={createErrorId}
                role="alert"
              >
                {createError === "item-limit"
                  ? t("errors.reason.entitlements.resourceLimit.desc")
                  : b("createError")}
              </p>
            ) : null}

            {properties.length > 0 ? (
              <section
                aria-label={b("properties")}
                className="mt-auto flex flex-wrap items-center gap-2 pt-10"
              >
                {properties.map((property) => {
                  const value = propertyValues[property.id];
                  const changeValue = (nextValue: PropertyValue | null) =>
                    setPropertyValues((current) => {
                      if (nextValue === null) {
                        const next = { ...current };
                        delete next[property.id];
                        return next;
                      }
                      return { ...current, [property.id]: nextValue };
                    });

                  return (
                    <PropertyValueField
                      appearance="composer"
                      className="max-w-48!"
                      disabled={isCreating}
                      emptyLabel={property.name}
                      key={property.id}
                      onValueChange={changeValue}
                      people={people}
                      property={property}
                      value={value}
                    />
                  );
                })}
              </section>
            ) : null}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none bg-muted/30 px-4 py-3 sm:justify-end sm:px-5">
            <Button
              aria-busy={isCreating}
              disabled={!taskName.trim() || isCreating}
              type="submit"
            >
              {isCreating ? (
                <>
                  <Spinner className="size-4" />
                  {b("creating")}
                </>
              ) : (
                t("common.create")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
