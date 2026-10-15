import { Button } from "@lunarisapp/ui/components/button";
import { DiscordIcon, HugeiconsIcon, RedditIcon } from "@lunarisapp/ui/icons";
import { cn } from "@lunarisapp/ui/lib/utils";
import { useTranslation } from "react-i18next";

export function HelpCenterCommunitiesSection() {
  const { t } = useTranslation();
  const bannerStyle =
    "bg-cover bg-center h-24 w-full rounded-lg flex items-center px-5";
  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <h4 className="font-medium leading-none">
          {t("helpCenter.community")}
        </h4>
        <p className="text-muted-foreground text-sm">
          {t("helpCenter.communityDescription")}
        </p>
      </div>
      <div
        className={cn(
          // Apply a Discord background image here,
          "bg-blue-100",
          bannerStyle
        )}
      >
        <Button
          className="text-blue-500 hover:text-blue-600"
          nativeButton={false}
          render={
            <a
              href="https://discord.gg"
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          size="lg"
          variant="outline"
        >
          <HugeiconsIcon className="mr-2" icon={DiscordIcon} size={18} />
          Discord
        </Button>
      </div>
      <div
        className={cn(
          // Apply a Reddit background image here,
          "justify-end bg-red-100",
          bannerStyle
        )}
      >
        <Button
          className="text-red-500 hover:text-red-600"
          nativeButton={false}
          render={
            <a
              href="https://reddit.com"
              rel="noopener noreferrer"
              target="_blank"
            />
          }
          size="lg"
          variant="outline"
        >
          <HugeiconsIcon className="mr-2" icon={RedditIcon} size={18} />
          Reddit
        </Button>
      </div>
    </div>
  );
}
