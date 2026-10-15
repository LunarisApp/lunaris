import { Button } from "@lunarisapp/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lunarisapp/ui/components/tooltip";
import { HelpCircleIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useId, useState } from "react";

export function BillingHint({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        aria-describedby={open ? hintId : undefined}
        closeOnClick={false}
        delay={200}
        render={
          <Button
            aria-label={label}
            className="size-6 shrink-0 text-muted-foreground"
            size="icon-sm"
            variant="ghost"
          />
        }
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon aria-hidden="true" icon={HelpCircleIcon} size={16} strokeWidth={1.5} />
      </TooltipTrigger>
      <TooltipContent
        id={hintId}
        role="tooltip"
        className="max-w-64 text-sm leading-relaxed"
        side="top"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
