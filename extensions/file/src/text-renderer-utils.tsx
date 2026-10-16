export interface LoadedTextRendererProps {
  filename: string;
  text: string;
}

export function toJsonViewValue(value: unknown): object {
  if (value && typeof value === "object") {
    return value;
  }

  return { $root: value };
}

export function PlainTextRenderer({ filename, text }: LoadedTextRendererProps) {
  return (
    <div className="h-full overflow-auto bg-background p-4">
      <pre
        role="region"
        aria-label={filename}
        className="whitespace-pre-wrap break-words font-mono text-foreground text-sm leading-6"
      >
        {text}
      </pre>
    </div>
  );
}
