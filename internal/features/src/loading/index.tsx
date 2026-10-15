import { Spinner } from "@lunarisapp/ui/components/spinner";

interface LoaderViewProps {
  /** Screen reader text describing what is loading */
  label?: string;
}

export function LoaderView({ label = "Loading application" }: LoaderViewProps) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="flex min-h-dvh w-full flex-1 items-center justify-center"
      role="status"
    >
      <Spinner
        aria-hidden="true"
        className="size-10 shrink-0"
        role="presentation"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
