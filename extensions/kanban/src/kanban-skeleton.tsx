import { Skeleton } from "@lunarisapp/ui/components/skeleton";

export function KanbanSkeleton() {
  return (
    <div
      aria-busy="true"
      className="flex h-full w-full flex-col"
      data-testid="kanban-skeleton"
      role="status"
    >
      <span className="sr-only">Loading kanban</span>
      <div className="flex items-center gap-2 border-b p-2">
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-18 rounded-md" />
        </div>
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden px-4 py-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className="flex min-w-56 max-w-60 flex-1 flex-col rounded-lg bg-muted/40 p-3"
            key={index}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-7 w-14 rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-20 rounded-md" />
              <Skeleton className="h-16 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
