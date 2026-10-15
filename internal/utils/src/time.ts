/**
 * Parses an ISO timestamp string as UTC.
 * SQLite/PowerSync may strip the trailing "Z" from ISO strings,
 * causing `new Date()` to interpret them as local time.
 */
export function parseUTCTimestamp(value: string): Date {
  const normalized = value.trim().replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  return new Date(hasTimezone || isDateOnly ? normalized : `${normalized}Z`);
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Function type for translating time strings */
export type TranslateTimeFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

/**
 * Formats a date as a relative time string (e.g., "5 minutes ago", "Yesterday").
 * @param date The date to format
 * @param locale Optional locale code for date formatting (defaults to "en-US")
 * @param t Optional translation function for relative time strings
 * @returns Relative time string
 */
export function formatRelativeTime(
  date: Date,
  locale?: string,
  t?: TranslateTimeFn
): string {
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < MINUTE) {
    return t ? t("time.justNow") : "Just now";
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    if (t) {
      return t("time.minutesAgo", { count: minutes });
    }
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    if (t) {
      return t("time.hoursAgo", { count: hours });
    }
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }

  if (diff < 2 * DAY) {
    return t ? t("time.yesterday") : "Yesterday";
  }

  // Format as short date (e.g., "Oct 8")
  const loc = locale ?? "en-US";
  return date.toLocaleDateString(loc, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Formats a date as a full absolute time string (e.g., "Oct 8, 2024 at 3:45 PM").
 * @param date The date to format
 * @param locale Optional locale code for date formatting (defaults to "en-US")
 * @param t Optional translation function for the "at" connector
 * @returns Absolute time string
 */
export function formatAbsoluteTime(
  date: Date,
  locale?: string,
  t?: TranslateTimeFn
): string {
  const loc = locale ?? "en-US";
  const datePart = date.toLocaleDateString(loc, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString(loc, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const at = t ? t("time.at") : "at";
  return `${datePart} ${at} ${timePart}`;
}
