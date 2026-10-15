import { Skeleton } from "@lunarisapp/ui/components/skeleton";

export function RichTextSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex h-full w-full flex-col bg-background"
      data-testid="rich-text-skeleton"
      role="status"
    >
      <span className="sr-only">Loading document</span>
      <div className="flex flex-1 flex-col gap-5 p-4">
        <Skeleton className="h-10 w-1/2 rounded-lg" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-8/12" />
        </div>
      </div>
    </div>
  );
}
