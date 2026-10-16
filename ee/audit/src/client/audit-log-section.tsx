"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lunarisapp/ui/components/alert";
import { Badge } from "@lunarisapp/ui/components/badge";
import { Button } from "@lunarisapp/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import { Input } from "@lunarisapp/ui/components/input";
import { Label } from "@lunarisapp/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@lunarisapp/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@lunarisapp/ui/components/sheet";
import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lunarisapp/ui/components/table";
import { ArrowRight01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useApi } from "@repo/features/api";
import { useOnlineStatus } from "@repo/platform";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  type FormEvent,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  type AuditEventFilters,
  type AuditEventListItem,
  type AuditOutcome,
  auditEventsInfiniteQueryOptions,
  organizationQueryKeys,
} from "./queries";

interface FilterDraft {
  action: string;
  actorId: string;
  from: string;
  outcome: "" | AuditOutcome;
  to: string;
}

const EMPTY_FILTERS: FilterDraft = {
  action: "",
  actorId: "",
  from: "",
  outcome: "",
  to: "",
};

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

export function AuditLogSection({
  active,
  organizationId,
}: {
  active: boolean;
  organizationId: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const activityHeadingId = useId();
  const filterHeadingId = useId();
  const rangeErrorId = useId();
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditEventFilters>({});
  const [rangeInvalid, setRangeInvalid] = useState(false);
  const [selected, setSelected] = useState<AuditEventListItem | null>(null);
  const query = useInfiniteQuery({
    ...auditEventsInfiniteQueryOptions(api, organizationId, filters),
    enabled: active,
  });
  const events = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages]
  );

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const from = toIsoDate(draft.from);
    const to = toIsoDate(draft.to);
    if (from && to && from > to) {
      setRangeInvalid(true);
      return;
    }
    setRangeInvalid(false);
    setFilters({
      action: draft.action.trim() || undefined,
      actorId: draft.actorId.trim() || undefined,
      from,
      outcome: draft.outcome || undefined,
      to,
    });
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters({});
    setRangeInvalid(false);
    void queryClient.resetQueries({
      exact: true,
      queryKey: organizationQueryKeys.auditEvents(organizationId, {}),
    });
  };

  return (
    <div className="space-y-5" data-testid="audit-log-section">
      {!online && (
        <Alert>
          <AlertTitle>{t("organization.audit.offlineTitle")}</AlertTitle>
          <AlertDescription>
            {t("organization.audit.offlineDescription")}
          </AlertDescription>
        </Alert>
      )}

      <section aria-busy={query.isFetching} className="min-w-0">
        <form
          aria-labelledby={filterHeadingId}
          className="border-b pb-8"
          onSubmit={applyFilters}
        >
          <h2 className="font-medium text-sm" id={filterHeadingId}>
            {t("organization.audit.filters")}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <FilterField
              className="lg:col-span-2"
              label={t("organization.audit.action")}
            >
              <Input
                aria-label={t("organization.audit.action")}
                disabled={!online}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder="workspace.updated"
                type="search"
                value={draft.action}
              />
            </FilterField>
            <FilterField
              className="lg:col-span-2"
              label={t("organization.audit.actorId")}
            >
              <Input
                aria-label={t("organization.audit.actorId")}
                disabled={!online}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    actorId: event.target.value,
                  }))
                }
                placeholder="user_…"
                type="search"
                value={draft.actorId}
              />
            </FilterField>
            <FilterField
              className="lg:col-span-2"
              label={t("organization.audit.outcome")}
            >
              <NativeSelect
                aria-label={t("organization.audit.outcome")}
                className="w-full"
                disabled={!online}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    outcome: event.target.value as FilterDraft["outcome"],
                  }))
                }
                value={draft.outcome}
              >
                <NativeSelectOption value="">
                  {t("organization.audit.allOutcomes")}
                </NativeSelectOption>
                <NativeSelectOption value="success">
                  {t("organization.audit.success")}
                </NativeSelectOption>
                <NativeSelectOption value="failure">
                  {t("organization.audit.failure")}
                </NativeSelectOption>
                <NativeSelectOption value="denied">
                  {t("organization.audit.denied")}
                </NativeSelectOption>
              </NativeSelect>
            </FilterField>
            <FilterField
              className="lg:col-span-3"
              label={t("organization.audit.from")}
            >
              <Input
                aria-describedby={rangeInvalid ? rangeErrorId : undefined}
                aria-invalid={rangeInvalid}
                disabled={!online}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                type="datetime-local"
                value={draft.from}
              />
            </FilterField>
            <FilterField
              className="lg:col-span-3"
              label={t("organization.audit.to")}
            >
              <Input
                aria-describedby={rangeInvalid ? rangeErrorId : undefined}
                aria-invalid={rangeInvalid}
                disabled={!online}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                type="datetime-local"
                value={draft.to}
              />
            </FilterField>
          </div>
          <div
            className={`mt-4 flex flex-col gap-3 sm:flex-row sm:items-center ${rangeInvalid ? "sm:justify-between" : "sm:justify-end"}`}
          >
            {!!rangeInvalid && (
              <p
                className="text-destructive text-sm"
                id={rangeErrorId}
                role="alert"
              >
                {t("organization.audit.invalidRange")}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                className="flex-1 sm:flex-none"
                disabled={!online}
                onClick={clearFilters}
                type="button"
                variant="ghost"
              >
                {t("organization.audit.clearFilters")}
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                disabled={!online}
                type="submit"
              >
                {t("organization.audit.applyFilters")}
              </Button>
            </div>
          </div>
        </form>

        {(online || events.length > 0) && (
          <>
            <div className="mt-8 flex items-center justify-between gap-3 border-b pb-3">
              <h2 className="font-medium text-sm" id={activityHeadingId}>
                {t("organization.audit.activity")}
              </h2>
              {events.length > 0 && (
                <span
                  aria-live="polite"
                  className="text-muted-foreground text-xs"
                >
                  {t("organization.audit.showingEvents", {
                    count: events.length,
                  })}
                </span>
              )}
            </div>

            {!!(query.isPending && online) && <AuditLoading />}

            {!!(query.isError && online) && (
              <div className="py-4">
                <Alert variant="destructive">
                  <AlertTitle>{t("organization.audit.loadFailed")}</AlertTitle>
                  <AlertDescription className="mt-2">
                    <Button
                      onClick={() => void query.refetch()}
                      size="sm"
                      variant="outline"
                    >
                      {t("common.retry")}
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {!(query.isPending || query.isError) &&
              events.length === 0 &&
              online && (
                <Empty className="min-h-52 border-0">
                  <EmptyHeader>
                    <EmptyTitle>{t("organization.audit.empty")}</EmptyTitle>
                    <EmptyDescription>
                      {t("organization.audit.emptyDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}

            {events.length > 0 && (
              <Table
                aria-labelledby={activityHeadingId}
                className="table-fixed"
              >
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="hidden h-9 w-28 px-4 text-muted-foreground text-xs lg:table-cell"
                      scope="col"
                    >
                      {t("organization.audit.time")}
                    </TableHead>
                    <TableHead
                      className="h-9 px-4 text-muted-foreground text-xs"
                      scope="col"
                    >
                      {t("organization.audit.action")}
                    </TableHead>
                    <TableHead
                      className="hidden h-9 w-36 px-4 text-muted-foreground text-xs md:table-cell"
                      scope="col"
                    >
                      {t("organization.audit.actor")}
                    </TableHead>
                    <TableHead
                      className="hidden h-9 w-36 px-4 text-muted-foreground text-xs lg:table-cell"
                      scope="col"
                    >
                      {t("organization.audit.target")}
                    </TableHead>
                    <TableHead
                      className="h-9 w-24 px-3 text-muted-foreground text-xs"
                      scope="col"
                    >
                      {t("organization.audit.outcome")}
                    </TableHead>
                    <TableHead
                      className="h-9 w-16 px-3 text-right text-muted-foreground text-xs sm:w-24"
                      scope="col"
                    >
                      {t("organization.audit.details")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((auditEvent) => (
                    <TableRow
                      className="group"
                      data-testid="audit-event-row"
                      key={auditEvent.id}
                    >
                      <TableCell className="hidden px-4 py-3 lg:table-cell">
                        <EventTime value={auditEvent.occurredAt} />
                      </TableCell>
                      <TableCell className="min-w-0 px-4 py-3">
                        <div className="min-w-0">
                          <code
                            className="block truncate font-medium text-foreground text-xs sm:text-sm"
                            title={auditEvent.action}
                          >
                            {auditEvent.action}
                          </code>
                          <div className="mt-1 lg:hidden">
                            <EventTime compact value={auditEvent.occurredAt} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 md:table-cell">
                        <Identifier
                          id={auditEvent.actorId}
                          type={auditEvent.actorType}
                        />
                      </TableCell>
                      <TableCell className="hidden px-4 py-3 lg:table-cell">
                        <Identifier
                          id={auditEvent.targetId}
                          type={auditEvent.targetType}
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3">
                        <OutcomeBadge outcome={auditEvent.outcome} />
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right">
                        <Button
                          aria-label={t("organization.audit.viewEvent", {
                            action: auditEvent.action,
                          })}
                          className="text-muted-foreground group-hover:text-foreground"
                          onClick={() => setSelected(auditEvent)}
                          size="sm"
                          variant="ghost"
                        >
                          <span className="hidden sm:inline">
                            {t("organization.audit.view")}
                          </span>
                          <HugeiconsIcon
                            aria-hidden="true"
                            data-icon="inline-end"
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                          />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!!query.hasNextPage && (
              <div className="flex justify-center border-t py-3">
                <Button
                  disabled={!online || query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  variant="outline"
                >
                  {query.isFetchingNextPage
                    ? t("organization.audit.loadingMore")
                    : t("organization.audit.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <AuditEventDetails
        event={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
      />
    </div>
  );
}

function FilterField({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <Label className={`flex-col items-stretch gap-1.5 ${className ?? ""}`}>
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      {children}
    </Label>
  );
}

function AuditLoading() {
  const { t } = useTranslation();
  return (
    <div aria-live="polite" role="status">
      <span className="sr-only">{t("organization.audit.loading")}</span>
      <div aria-hidden="true" className="divide-y">
        {[0, 1, 2].map((index) => (
          <div className="flex items-center gap-4 px-4 py-4" key={index}>
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTime({
  compact = false,
  value,
}: {
  compact?: boolean;
  value: string;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span>{value}</span>;
  }
  const dateFormatter = getDateFormatter(locale);
  const timeFormatter = getTimeFormatter(locale);
  if (compact) {
    return (
      <time
        className="text-[11px] text-muted-foreground"
        dateTime={value}
        title={value}
      >
        {dateFormatter.format(date)} · {timeFormatter.format(date)}
      </time>
    );
  }
  return (
    <time className="block" dateTime={value} title={value}>
      <span className="block font-medium text-xs">
        {dateFormatter.format(date)}
      </span>
      <span className="mt-0.5 block text-muted-foreground text-xs">
        {timeFormatter.format(date)}
      </span>
    </time>
  );
}

function Identifier({ id, type }: { id: string | null; type: string | null }) {
  const { t } = useTranslation();
  if (!(id || type)) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      {!!type && (
        <Badge
          className="h-5 bg-muted/35 text-[10px] text-muted-foreground uppercase tracking-wide"
          variant="outline"
        >
          {type}
        </Badge>
      )}
      <code
        className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
        title={id ?? undefined}
      >
        {id ?? t("organization.audit.unknown")}
      </code>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  const { t } = useTranslation();
  const label = t(`organization.audit.${outcome}`);
  const style = {
    denied:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    failure: "border-destructive/25 bg-destructive/10 text-destructive",
    success:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  }[outcome];
  const dot = {
    denied: "bg-amber-500",
    failure: "bg-destructive",
    success: "bg-emerald-500",
  }[outcome];
  return (
    <Badge
      className={`max-w-full gap-1.5 ${style}`}
      title={label}
      variant="outline"
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

function AuditEventDetails({
  event,
  onOpenChange,
}: {
  event: AuditEventListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <Sheet onOpenChange={onOpenChange} open={event !== null}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle>{t("organization.audit.eventDetails")}</SheetTitle>
          <SheetDescription
            className="truncate font-mono text-xs"
            title={event?.action}
          >
            {event?.action ?? t("organization.audit.details")}
          </SheetDescription>
        </SheetHeader>
        {!!event && (
          <dl className="divide-y px-5">
            <Detail label={t("organization.audit.eventId")}>
              <TechnicalId value={event.id} />
            </Detail>
            <Detail label={t("organization.audit.time")}>
              <time dateTime={event.occurredAt}>
                {formatDate(event.occurredAt, locale)}
              </time>
              <code className="block break-all text-muted-foreground text-xs">
                {event.occurredAt}
              </code>
            </Detail>
            <Detail label={t("organization.audit.action")}>
              <code className="break-all text-xs">{event.action}</code>
            </Detail>
            <Detail label={t("organization.audit.actor")}>
              <Identifier id={event.actorId} type={event.actorType} />
            </Detail>
            <Detail label={t("organization.audit.target")}>
              <Identifier id={event.targetId} type={event.targetType} />
            </Detail>
            <Detail label={t("organization.audit.outcome")}>
              <OutcomeBadge outcome={event.outcome} />
            </Detail>
            <Detail label={t("organization.audit.reason")}>
              {event.reason ?? "—"}
            </Detail>
            <Detail label={t("organization.audit.changedFields")}>
              {event.changedFields.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {event.changedFields.map((field) => (
                    <Badge
                      className="max-w-full"
                      key={field}
                      title={field}
                      variant="outline"
                    >
                      <code className="min-w-0 truncate text-[11px]">
                        {field}
                      </code>
                    </Badge>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label={t("organization.audit.requestId")}>
              <TechnicalId value={event.requestId} />
            </Detail>
            <Detail label={t("organization.audit.traceId")}>
              <TechnicalId value={event.traceId} />
            </Detail>
          </dl>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="font-medium text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function TechnicalId({ value }: { value: string | null }) {
  return value ? <code className="break-all text-xs">{value}</code> : "—";
}

function toIsoDate(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDate(value: string, locale?: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale || undefined);
}

function getDateFormatter(locale?: string): Intl.DateTimeFormat {
  return getFormatter(DATE_FORMATTERS, locale, { dateStyle: "medium" });
}

function getTimeFormatter(locale?: string): Intl.DateTimeFormat {
  return getFormatter(TIME_FORMATTERS, locale, { timeStyle: "short" });
}

function getFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = locale ?? "default";
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat(locale || undefined, options);
  cache.set(key, formatter);
  return formatter;
}
