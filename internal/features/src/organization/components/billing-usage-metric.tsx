import { Progress } from "@lunarisapp/ui/components/progress";
import { Children, type ReactNode } from "react";
import { BillingHint } from "./billing-hint";

export function BillingUsageMetric({
  label,
  valueText,
  hint,
  progressText = valueText,
  value,
  max,
  children,
}: {
  label: string;
  valueText: string;
  hint?: string;
  progressText?: string;
  value?: number;
  max?: number;
  children: ReactNode;
}) {
  const measured = value !== undefined && max !== undefined;
  const hasMessage = Children.toArray(children).length > 0;
  return (
    <div className="@2xl/billing:row-span-4 grid min-w-0 @2xl/billing:grid-rows-subgrid grid-rows-[auto_auto_auto_1fr] gap-3 p-4">
      <div className="flex items-center gap-1.5">
        <h3 className="font-medium text-sm">{label}</h3>
        {!!hint && <BillingHint label={label} hint={hint} />}
      </div>
      <p className="wrap-anywhere font-medium text-sm tabular-nums">
        {valueText}
      </p>
      <Progress
        aria-label={label}
        aria-valuetext={progressText}
        className={
          measured
            ? "w-full"
            : "w-full [&_[data-slot=progress-indicator]]:hidden"
        }
        max={measured ? Math.max(1, max) : undefined}
        value={measured ? Math.min(value, Math.max(1, max)) : null}
      />
      {hasMessage && (
        <div className="wrap-anywhere space-y-2 text-sm leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}
