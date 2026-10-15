import { Button } from "@lunarisapp/ui/components/button";
import { CustomerSupportIcon, HugeiconsIcon, Mail01Icon } from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";

const CEO_CHAT_URL = "https://cal.eu/rsirokov/chat";

export function HelpCenterSupportSection() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">{t("helpCenter.needHelp")}</h4>
        <p className="text-muted-foreground text-sm">
          {t("helpCenter.needHelpDescription")}
        </p>
      </div>
      <div className="grid gap-2">
        <div className="grid grid-cols-2 items-center gap-4">
          <Button
            nativeButton={false}
            render={<a href="mailto:hello@lunaris.app" />}
            variant="outline"
          >
            <HugeiconsIcon className="mr-0.5" icon={Mail01Icon} />{" "}
            {t("helpCenter.contact")}
          </Button>
          <Button
              nativeButton={false}
              render={(
                <a
                  href={CEO_CHAT_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              )}
              variant="outline"
            >
              <HugeiconsIcon className="mr-0.5" icon={CustomerSupportIcon} />
              {t("announcements.ceoChatCta")}
            </Button>
        </div>
      </div>
    </div>
  );
}
