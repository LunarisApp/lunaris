import { Button } from "@lunarisapp/ui/components/button";
import {
  GithubIcon,
  HugeiconsIcon,
  LinkedinIcon,
  NewTwitterIcon,
} from "@lunarisapp/ui/icons";
import { useTranslation } from "react-i18next";

export function HelpCenterSocialMediaSection() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">
          {t("helpCenter.socialMedia")}
        </h4>
        <p className="text-muted-foreground text-sm">
          {t("helpCenter.socialMediaDescription")}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Button
          nativeButton={false}
          render={
            <a
              href="https://www.linkedin.com/company/lunarisapp"
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          variant="outline"
        >
          <span className="sr-only">LinkedIn</span>
          <HugeiconsIcon icon={LinkedinIcon} size={15} />
        </Button>
        <Button
          nativeButton={false}
          render={
            <a
              href="https://x.com/lunarisapp"
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          variant="outline"
        >
          <span className="sr-only">X (Twitter)</span>
          <HugeiconsIcon icon={NewTwitterIcon} size={15} />
        </Button>
        <Button
          nativeButton={false}
          render={
            <a
              href="https://github.com/LunarisApp"
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          variant="outline"
        >
          <span className="sr-only">GitHub</span>
          <HugeiconsIcon icon={GithubIcon} size={15} />
        </Button>
      </div>
    </div>
  );
}
