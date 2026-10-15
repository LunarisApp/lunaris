import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@lunarisapp/ui/components/empty";
import { FileAddIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";

export function WorkspaceTreeEmpty() {
  const { t } = useTranslation();
  return (
    <Empty className="px-4 py-8" data-testid="workspace-tree-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={FileAddIcon} />
        </EmptyMedia>
        <EmptyTitle>{t("explorer.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("explorer.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
