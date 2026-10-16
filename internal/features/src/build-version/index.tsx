export function BuildVersion({ version }: { version: string }) {
  return (
    <p className="whitespace-nowrap text-center text-muted-foreground text-xs">
      Build: {version}
    </p>
  );
}
