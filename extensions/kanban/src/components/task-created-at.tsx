import { useLocale } from "@lunarisapp/plugin-sdk";
import {
  formatAbsoluteTime,
  formatRelativeTime,
  parseUTCTimestamp,
} from "@lunarisapp/plugin-sdk/time";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

interface TaskCreatedAtProps {
  className?: string;
  createdAt?: string;
  prefix?: string;
}

export function TaskCreatedAt({
  className,
  createdAt,
  prefix,
}: TaskCreatedAtProps) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const timestamp = useMemo(() => {
    if (!createdAt) return null;

    const parsed = parseUTCTimestamp(createdAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [createdAt]);

  if (!timestamp) {
    return null;
  }

  const relativeTime = formatRelativeTime(timestamp, locale, t);
  const absoluteTime = formatAbsoluteTime(timestamp, locale, t);

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex w-fit" />}>
        <span className={className}>
          {prefix ? `${prefix} ` : null}
          {relativeTime}
        </span>
      </TooltipTrigger>
      <TooltipContent>{absoluteTime}</TooltipContent>
    </Tooltip>
  );
}
