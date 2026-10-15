import {
  type PluginResource,
  type PluginUser,
  useApiTransport,
  useCurrentUser,
  useOrgMembersMap,
} from "@lunarisapp/plugin-sdk";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import { Button } from "@lunarisapp/ui/components/button";
import { Textarea } from "@lunarisapp/ui/components/textarea";
import { useGravatarUrl } from "@lunarisapp/ui/hooks/use-gravatar-url";
import {
  ArrowUpRight01Icon,
  Calendar03Icon,
  HugeiconsIcon,
  type IconSvgObject,
  KanbanIcon,
  UserIcon,
} from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { Doc, Map as YMap } from "yjs";
import { useYMapField } from "../hooks";
import { getTaskPropertyValue } from "../task-assignments";
import type { PropertyValue } from "../types";
import { useProperties } from "../use-properties";
import { TaskCreatedAt } from "./task-created-at";
import { PropertyTypeIcon } from "./property-field-shared";
import { PropertyValueField } from "./property-value-field";

interface TaskDetailProps {
  assignment?: YMap<unknown>;
  boardDoc: Doc;
  boardName: string;
  onOpenBoard: (title: string) => void;
  onPropertyChange?: (propertyId: string, value: PropertyValue | null) => void;
  onRename?: (name: string) => void;
  readOnly?: boolean;
  task: PluginResource;
  taskDoc: Doc;
}

export function TaskDetail({
  assignment,
  boardDoc,
  boardName,
  onOpenBoard,
  onPropertyChange,
  onRename,
  readOnly = false,
  task,
  taskDoc,
}: TaskDetailProps) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const { baseUrl: apiBaseUrl } = useApiTransport();
  const { user: currentUser } = useCurrentUser();
  const { map: members } = useOrgMembersMap();
  const people = useMemo(() => {
    const result = new Map(members);
    if (currentUser?.id) result.set(currentUser.id, currentUser);
    return result;
  }, [currentUser, members]);
  const { properties } = useProperties(boardDoc);
  const taskMap = taskDoc.getMap<string>("task");
  const creator = resolveCreator(
    taskMap.get("createdById") ?? "",
    currentUser,
    members,
    b("unknownCreator")
  );
  const taskTitle = task.name?.trim() || b("untitled");
  const boardTitle = boardName.trim() || b("untitled");

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-background">
      <div className="grid min-h-0 flex-1 overflow-y-auto @3xl:grid-cols-[minmax(0,1fr)_20rem] @3xl:overflow-hidden">
        <main className="min-h-0 p-5 md:p-6 @3xl:overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-4">
            <TaskFields
              canRename={Boolean(onRename)}
              initialName={taskTitle}
              onRename={onRename}
              readOnly={readOnly}
              taskMap={taskMap}
            />
          </div>
        </main>
        <aside className="min-h-0 px-5 pb-5 md:px-6 md:pb-6 @3xl:overflow-y-auto @3xl:py-6 @3xl:pr-6 @3xl:pl-0">
          <dl className="@container divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card px-3">
            {properties.map((property) => (
              <MetadataRow
                key={property.id}
                label={
                  <MetadataLabel icon={<PropertyTypeIcon type={property.type} />}>
                    {property.name}
                  </MetadataLabel>
                }
              >
                <PropertyValueField
                  appearance="metadata"
                  className={
                    property.type === "checkbox"
                      ? undefined
                      : "max-w-full"
                  }
                  disabled={readOnly}
                  onValueChange={(value) =>
                    onPropertyChange?.(property.id, value)
                  }
                  property={property}
                  people={people}
                  value={getTaskPropertyValue(assignment, property)}
                />
              </MetadataRow>
            ))}
            <MetadataRow
              className={properties.length > 0 ? "mt-2" : undefined}
              label={
                <StaticMetadataLabel icon={UserIcon}>
                  {b("metadata.creator")}
                </StaticMetadataLabel>
              }
            >
              <span className="flex min-h-7 min-w-0 items-center gap-2 px-1.5">
                <ExtensionUserAvatar
                  apiBaseUrl={apiBaseUrl}
                  user={creator.user}
                />
                <span className="truncate text-sm">{creator.label}</span>
              </span>
            </MetadataRow>
            <MetadataRow
              label={
                <StaticMetadataLabel icon={Calendar03Icon}>
                  {b("metadata.created")}
                </StaticMetadataLabel>
              }
            >
              <TaskCreatedAt
                className="text-sm text-foreground"
                createdAt={task.createdAt ?? ""}
              />
            </MetadataRow>
            <MetadataRow
              label={
                <StaticMetadataLabel icon={KanbanIcon}>
                  {b("metadata.board")}
                </StaticMetadataLabel>
              }
            >
              <Button
                aria-label={`${b("metadata.board")}: ${boardTitle}`}
                className="h-7 max-w-full min-w-0 justify-start gap-1.5 px-1.5 font-normal"
                onClick={() => onOpenBoard(boardTitle)}
                size="sm"
                variant="ghost"
              >
                <span className="truncate">{boardTitle}</span>
                <HugeiconsIcon
                  aria-hidden="true"
                  className="shrink-0 text-muted-foreground"
                  icon={ArrowUpRight01Icon}
                  size={14}
                  strokeWidth={2}
                />
              </Button>
            </MetadataRow>
          </dl>
        </aside>
      </div>
    </div>
  );
}

function MetadataLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 [&>svg]:shrink-0">
      {icon}
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

function StaticMetadataLabel({
  children,
  icon,
}: {
  children: ReactNode;
  icon: IconSvgObject;
}) {
  return (
    <MetadataLabel
      icon={
        <HugeiconsIcon
          aria-hidden="true"
          icon={icon}
          size={14}
          strokeWidth={2}
        />
      }
    >
      {children}
    </MetadataLabel>
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
    <Avatar size="sm">
      {avatarUrl ? <AvatarImage alt={label} src={avatarUrl} /> : null}
      <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function getUploadedAvatarUrl(
  apiBaseUrl: string,
  user: PluginUser | undefined
): string | undefined {
  if (!user?.image) return undefined;
  if (!user.id) return user.image;

  const baseUrl = apiBaseUrl.replace(/\/+$/, "");
  return `${baseUrl}/v1/account/avatar/${encodeURIComponent(user.id)}`;
}

function MetadataRow({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-3 gap-y-1.5 py-2.5 @min-[17rem]:grid-cols-[6.5rem_minmax(0,1fr)]",
        className
      )}
    >
      <dt className="min-w-0 break-words text-xs font-medium text-muted-foreground @min-[17rem]:pt-1.5">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function TaskFields({
  canRename,
  initialName,
  onRename,
  readOnly,
  taskMap,
}: {
  canRename: boolean;
  initialName: string;
  onRename?: (name: string) => void;
  readOnly: boolean;
  taskMap: YMap<string>;
}) {
  const { t } = useTranslation();
  const b = (key: string) => t(`extensions.catalog.lunaris.kanban.${key}`);
  const [description, setDescription] = useYMapField(taskMap, "description");
  const [titleDraft, setTitleDraft] = useState(initialName);

  useEffect(() => setTitleDraft(initialName), [initialName]);

  const commitTitle = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(initialName);
      return;
    }
    setTitleDraft(trimmed);
    if (trimmed !== initialName) onRename?.(trimmed);
  }, [initialName, onRename, titleDraft]);

  return (
    <>
      <h1 className="m-0">
        <Textarea
          aria-label={b("fields.name")}
          className="field-sizing-content min-h-0 resize-none border-0 bg-transparent px-0 py-1 text-2xl font-semibold leading-tight shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 md:text-2xl dark:bg-transparent"
          disabled={!canRename}
          id="item-name"
          maxLength={120}
          onBlur={commitTitle}
          onChange={(event) =>
            setTitleDraft(event.target.value.replace(/\n/g, " "))
          }
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitTitle();
            event.currentTarget.blur();
          }}
          placeholder={b("fields.name")}
          rows={1}
          value={titleDraft}
        />
      </h1>
      <Textarea
        aria-label={b("fields.description")}
        className="min-h-32 resize-none border-0 bg-transparent px-0 py-2 leading-6 shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
        disabled={readOnly}
        id="item-desc"
        onChange={(event) => setDescription(event.target.value)}
        placeholder={b("placeholders.description")}
        rows={5}
        value={description}
      />
    </>
  );
}

export function resolveCreator(
  creatorId: string,
  currentUser: PluginUser | undefined,
  members: Map<string, PluginUser>,
  unknownLabel: string
): { label: string; user: PluginUser | undefined } {
  if (!creatorId) return { label: unknownLabel, user: undefined };

  const user = creatorId === currentUser?.id ? currentUser : members.get(creatorId);
  if (!user) return { label: unknownLabel, user: { id: creatorId } };

  return {
    label: user.name || user.email || unknownLabel,
    user,
  };
}
