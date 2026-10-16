import { Button } from "@lunarisapp/ui/components/button";
import { BookOpen01Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";

const DOCS_URL = "https://docs.lunaris.app";

export function HelpCenterDocsSection() {
  const { t } = useTranslation();

  return (
    <section aria-label={t("common.docs")}>
      <Button
        className="h-auto w-full items-center justify-start gap-3 whitespace-normal py-2"
        nativeButton={false}
        render={<a href={DOCS_URL} rel="noopener noreferrer" target="_blank" />}
        variant="outline"
      >
        <HugeiconsIcon className="shrink-0" icon={BookOpen01Icon} />
        <span className="grid min-w-0 flex-1 gap-0 text-left">
          <span>{t("common.docs")}</span>
          <span className="-mt-0.5 font-normal text-muted-foreground text-xs leading-relaxed">
            {t("helpCenter.docsDescription")}
          </span>
        </span>
      </Button>
    </section>
  );
}
