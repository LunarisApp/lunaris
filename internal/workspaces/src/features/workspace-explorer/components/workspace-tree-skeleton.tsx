import { Skeleton } from "@lunarisapp/ui/components/skeleton";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useTranslation } from "react-i18next";

const ROW_COUNT = 8;
// Indent per row — mix flush + nested to read as a tree silhouette.
const INDENT = ["", "pl-5", "", "pl-5", "pl-10", "", "pl-5", "pl-5"];
// Name-bar widths — varied to avoid a striped-loader look.
const WIDTHS = ["70%", "55%", "80%", "40%", "65%", "75%", "50%", "60%"];

export function WorkspaceTreeSkeleton() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  return (
    <ul
      aria-busy="true"
      aria-label={t("explorer.loading")}
      aria-live="polite"
      className="flex flex-col gap-1 pt-2"
      data-testid="workspace-tree-skeleton"
    >
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <li
          className={cn(
            "flex items-center gap-2",
            isMobile ? "h-16 px-3 py-2.5" : "h-13 px-2 py-1.5",
            INDENT[i]
          )}
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          key={i}
        >
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5 rounded-sm" style={{ width: WIDTHS[i] }} />
        </li>
      ))}
    </ul>
  );
}
