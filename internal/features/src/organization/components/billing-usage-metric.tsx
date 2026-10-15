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
    <div className="grid min-w-0 grid-rows-[auto_auto_auto_1fr] gap-3 p-4 @2xl/billing:row-span-4 @2xl/billing:grid-rows-subgrid">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-medium">{label}</h3>
        {hint && <BillingHint label={label} hint={hint} />}
      </div>
      <p className="text-sm font-medium tabular-nums wrap-anywhere">{valueText}</p>
      <Progress
        aria-label={label}
        aria-valuetext={progressText}
        className={measured ? "w-full" : "w-full [&_[data-slot=progress-indicator]]:hidden"}
        max={measured ? Math.max(1, max) : undefined}
        value={measured ? Math.min(value, Math.max(1, max)) : null}
      />
      {hasMessage && (
        <div className="space-y-2 text-sm leading-relaxed wrap-anywhere">{children}</div>
      )}
    </div>
  );
}
