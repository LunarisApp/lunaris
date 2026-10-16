import { Button } from "@lunarisapp/ui/components/button";
import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { getUserFacingError } from "@repo/data/http";
import { usePlatform } from "@repo/platform";
import { captureExceptionSafe } from "@repo/utils/posthog";
import { log, parseError } from "evlog";
import i18n from "i18next";
import { useEffect, useRef } from "react";
import type { FallbackProps } from "react-error-boundary";
import { useRouteError } from "react-router";

const t = (key: string, defaultValue: string): string =>
  i18n.t(key, { defaultValue }) as string;

// React Router ErrorBoundary
export function RouteCriticalError() {
  const error = useRouteError();
  return <CriticalErrorView error={error} />;
}

// react-error-boundary FallbackComponent
export function CriticalError({
  error: propError,
  resetErrorBoundary,
}: Partial<FallbackProps>) {
  return <CriticalErrorView error={propError} reset={resetErrorBoundary} />;
}

function CriticalErrorView({
  error,
  reset,
}: {
  error: unknown;
  reset?: () => void;
}) {
  const { navigation } = usePlatform();
  const reportedErrorRef = useRef<unknown>(undefined);
  const hasReportedRef = useRef(false);

  useEffect(() => {
    if (hasReportedRef.current && Object.is(reportedErrorRef.current, error)) {
      return;
    }
    hasReportedRef.current = true;
    reportedErrorRef.current = error;

    try {
      log.error({
        action: "app.render.critical_error",
        outcome: "failure",
        error: parseError(error),
      });
    } catch (logErr) {
      console.error("[CriticalError]", logErr);
    }
    captureExceptionSafe(error);
  }, [error]);

  const ufe = getUserFacingError(error);
  const title = t(ufe.titleKey, "Something went wrong");
  const description =
    ufe.description ??
    t(ufe.descriptionKey, "An unexpected error occurred. Please try again.");
  const retryLabel = t("common.retry", "Retry");
  const onRetry = reset ?? navigation.reload;

  return (
    <PanelError
      actions={
        <div className="flex flex-col items-center gap-3">
          <Button onClick={onRetry}>{retryLabel}</Button>
          {!!ufe.requestId && (
            <RequestId
              id={ufe.requestId}
              label={t("errors.boundary.requestIdLabel", "Request ID")}
            />
          )}
          {!!(import.meta.env.DEV && error instanceof Error && error.stack) && (
            <details className="max-w-md text-left">
              <summary className="cursor-pointer text-muted-foreground text-xs">
                {t("errors.boundary.devDetails", "Developer details")}
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      }
      description={description}
      title={title}
      variant="error"
    />
  );
}

function RequestId({ id, label }: { id: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <span>{label}:</span>
      <code className="rounded bg-muted px-1 py-0.5 font-mono">{id}</code>
    </div>
  );
}
