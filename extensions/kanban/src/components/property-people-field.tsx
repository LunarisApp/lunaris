import { type PluginUser, useApiTransport } from "@lunarisapp/plugin-sdk";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import { Input } from "@lunarisapp/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { useGravatarUrl } from "@lunarisapp/ui/hooks/use-gravatar-url";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PropertyValue } from "../types";
import {
  PropertyFieldButton,
  type PropertyFieldAppearance,
  PropertyPlaceholder,
  PropertyTypeIcon,
} from "./property-field-shared";
import {
  propertyPickerContentClassName,
  PropertyPickerList,
  PropertyPickerMessage,
  PropertyPickerOption,
} from "./property-picker";

interface PeopleFieldProps {
  appearance: PropertyFieldAppearance;
  className?: string;
  disabled: boolean;
  emptyLabel?: string;
  onValueChange: (value: PropertyValue | null) => void;
  people: Map<string, PluginUser>;
  propertyName: string;
  value: string[];
}

export function PeopleField({
  appearance,
  className,
  disabled,
  emptyLabel,
  onValueChange,
  people,
  propertyName,
  value,
}: PeopleFieldProps) {
  const { t } = useTranslation();
  const { baseUrl: apiBaseUrl } = useApiTransport();
  const [query, setQuery] = useState("");
  const knownPeople = useMemo(
    () =>
      [...people.entries()]
        .filter(([, user]) => {
          const haystack =
            `${user.name ?? ""} ${user.email ?? ""}`.toLocaleLowerCase();
          return haystack.includes(query.toLocaleLowerCase());
        })
        .sort(([, left], [, right]) =>
          personLabel(left).localeCompare(personLabel(right))
        ),
    [people, query]
  );

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        render={
          <PropertyFieldButton
            appearance={appearance}
            aria-label={propertyName}
            className={cn("h-7 min-w-20 justify-start", className)}
          />
        }
      >
        {appearance === "composer" ? <PropertyTypeIcon type="people" /> : null}
        {value.length > 0 && appearance === "metadata" ? (
          <PersonValue
            apiBaseUrl={apiBaseUrl}
            id={value[0]!}
            remaining={value.length - 1}
            user={people.get(value[0]!)}
          />
        ) : value.length > 0 ? (
          <AvatarGroup>
            {value.slice(0, 3).map((id) => (
              <PersonAvatar
                apiBaseUrl={apiBaseUrl}
                fallbackLabel={id}
                key={id}
                user={people.get(id)}
              />
            ))}
            {value.length > 3 ? (
              <AvatarGroupCount className="size-6 text-xs">
                +{value.length - 3}
              </AvatarGroupCount>
            ) : null}
          </AvatarGroup>
        ) : (
          <PropertyPlaceholder>
            {emptyLabel ??
              t(
                "extensions.catalog.lunaris.kanban.propertyPlaceholders.people"
              )}
          </PropertyPlaceholder>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={propertyPickerContentClassName("people")}
      >
        <Input
          aria-label={t("extensions.catalog.lunaris.kanban.searchPeople")}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("extensions.catalog.lunaris.kanban.searchPeople")}
          type="search"
          value={query}
        />
        <PropertyPickerList>
          {knownPeople.map(([id, user]) => (
            <PersonOption
              apiBaseUrl={apiBaseUrl}
              checked={value.includes(id)}
              id={id}
              key={id}
              onToggle={() => onValueChange(togglePerson(value, id))}
              user={user}
            />
          ))}
          {knownPeople.length === 0 ? (
            <PropertyPickerMessage>
              {t("extensions.catalog.lunaris.kanban.noPeopleFound")}
            </PropertyPickerMessage>
          ) : null}
          {value
            .filter((id) => !people.has(id))
            .map((id) => (
              <PersonOption
                apiBaseUrl={apiBaseUrl}
                checked
                id={id}
                key={id}
                onToggle={() => onValueChange(togglePerson(value, id))}
              />
            ))}
        </PropertyPickerList>
      </PopoverContent>
    </Popover>
  );
}

function togglePerson(value: string[], id: string): string[] | null {
  const next = value.includes(id)
    ? value.filter((candidate) => candidate !== id)
    : [...value, id];
  return next.length > 0 ? next : null;
}

function PersonOption({
  apiBaseUrl,
  checked,
  id,
  onToggle,
  user,
}: {
  apiBaseUrl: string;
  checked: boolean;
  id: string;
  onToggle: () => void;
  user?: PluginUser;
}) {
  const label = user ? personLabel(user) : id;
  return (
    <PropertyPickerOption checked={checked} onSelect={onToggle}>
      <PersonAvatar apiBaseUrl={apiBaseUrl} fallbackLabel={id} user={user} />
      {user ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{label}</span>
          {user.email && user.email !== user.name ? (
            <span className="block truncate text-muted-foreground text-xs">
              {user.email}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{id}</span>
      )}
    </PropertyPickerOption>
  );
}

function PersonValue({
  apiBaseUrl,
  id,
  remaining,
  user,
}: {
  apiBaseUrl: string;
  id: string;
  remaining: number;
  user?: PluginUser;
}) {
  const label = user ? personLabel(user) : id;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar
        apiBaseUrl={apiBaseUrl}
        className="size-6"
        fallbackLabel={id}
        user={user}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {remaining > 0 ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
          +{remaining}
        </span>
      ) : null}
    </span>
  );
}

export function PersonAvatar({
  apiBaseUrl,
  className,
  fallbackLabel = "?",
  user,
}: {
  apiBaseUrl: string;
  className?: string;
  fallbackLabel?: string;
  user?: PluginUser;
}) {
  const label = user ? personLabel(user) : fallbackLabel;
  const uploadedAvatarUrl = getUploadedAvatarUrl(apiBaseUrl, user);
  const gravatarUrl = useGravatarUrl(user?.email, 48);
  const avatarUrl = uploadedAvatarUrl ?? gravatarUrl;
  return (
    <Avatar className={className} size="sm" title={label}>
      {avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
      <AvatarFallback>{label.slice(0, 1).toLocaleUpperCase()}</AvatarFallback>
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

export function personLabel(user: PluginUser): string {
  return user.name || user.email || user.id || "?";
}
