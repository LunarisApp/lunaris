import { cn } from "@lunarisapp/ui/lib/utils";

/** The app shells serve both marks locally, including while offline. */
export function LunarisMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-7 shrink-0", className)}
    >
      <img
        alt=""
        className="size-full dark:hidden"
        draggable={false}
        height={28}
        src="/favicon-light.svg"
        width={28}
      />
      <img
        alt=""
        className="hidden size-full dark:block"
        draggable={false}
        height={28}
        src="/favicon-dark.svg"
        width={28}
      />
    </span>
  );
}
