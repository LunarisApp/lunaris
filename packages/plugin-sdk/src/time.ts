/**
 * Parses an ISO timestamp as UTC when SQLite/PowerSync omitted its trailing
 * timezone marker.
 */
export function parseUTCTimestamp(value: string): Date {
  if (
    !value.endsWith("Z") &&
    !value.includes("+") &&
    !/\d{2}:\d{2}$/.test(value.slice(-6))
  ) {
    return new Date(`${value}Z`);
  }
  return new Date(value);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type TranslateTimeFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export function formatRelativeTime(
  date: Date,
  locale?: string,
  t?: TranslateTimeFn,
): string {
  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) return t ? t("time.justNow") : "Just now";

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return t
      ? t("time.minutesAgo", { count: minutes })
      : `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return t
      ? t("time.hoursAgo", { count: hours })
      : `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  if (diff < 2 * DAY) return t ? t("time.yesterday") : "Yesterday";

  return date.toLocaleDateString(locale ?? "en-US", {
    day: "numeric",
    month: "short",
  });
}

export function formatAbsoluteTime(
  date: Date,
  locale?: string,
  t?: TranslateTimeFn,
): string {
  const resolvedLocale = locale ?? "en-US";
  const datePart = date.toLocaleDateString(resolvedLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(resolvedLocale, {
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
  });
  return `${datePart} ${t ? t("time.at") : "at"} ${timePart}`;
}
