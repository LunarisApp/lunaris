export function BuildVersion({ version }: { version: string }) {
  return (
    <p className="text-muted-foreground whitespace-nowrap text-center text-xs">
      Build: {version}
    </p>
  );
}
