import type {
  PresenceUser,
  ResourcePresenceResult,
} from "@lunarisapp/plugin-sdk";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { useTranslation } from "react-i18next";

type Participant = PresenceUser;
export function PresenceBadges({
  participants,
  status,
}: ResourcePresenceResult) {
  const { t } = useTranslation();
  const prefix = "resourcePresence";
  if (status === "error") {
    return (
      <span
        role="status"
        className="text-muted-foreground text-xs"
        title={t(`${prefix}.unavailable`)}
      >
        <span aria-hidden="true">○</span>
        <span className="sr-only">{t(`${prefix}.unavailable`)}</span>
      </span>
    );
  }
  if (status !== "connected" || participants.length === 0) {
    return null;
  }
  const name = (participant: Participant) =>
    participant.name.trim() || t(`${prefix}.collaborator`);
  const avatar = (participant: Participant) => (
    <Avatar
      key={participant.id}
      size="sm"
      style={{ border: `2px solid ${participant.color}` }}
    >
      <AvatarImage alt="" src={participant.image || undefined} />
      <AvatarFallback>
        {name(participant)
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => Array.from(word)[0])
          .join("")
          .toLocaleUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
  return (
    <div className="flex shrink-0 justify-end">
      <Popover>
        <PopoverTrigger
          aria-label={t(`${prefix}.viewParticipants`, {
            count: participants.length,
          })}
          className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <AvatarGroup aria-hidden="true">
            {participants.slice(0, 3).map(avatar)}
          </AvatarGroup>
          {participants.length > 3 ? (
            <span aria-hidden="true" className="text-muted-foreground text-xs">
              +{participants.length - 3}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end">
          <PopoverTitle>{t(`${prefix}.viewing`)}</PopoverTitle>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="flex min-w-0 items-center gap-2"
              >
                {avatar(participant)}
                <span className="min-w-0 break-words">{name(participant)}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
