import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import { Button } from "@lunarisapp/ui/components/button";
import { useTranslation } from "react-i18next";
import announcementArt from "../assets/abstract_bg.webp";

const CEO_CHAT_URL = "https://cal.eu/rsirokov/chat";

export function CeoChatBanner() {
  const { t } = useTranslation();

  return (
    <div
      className="relative flex h-40 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border bg-black bg-center bg-cover px-4 text-center text-white md:flex-row md:gap-12 md:px-8 md:text-left"
      style={{ backgroundImage: `url(${announcementArt})` }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />

      {/* Avatar */}
      <div className="relative flex shrink-0 flex-col items-center gap-1">
        <Avatar className="md:size-16" size="lg">
          <AvatarImage
            alt="Roman"
            src="https://gravatar.com/avatar/bcee2756a87ee67b001f8ee376f94b06d26a0ae41d2d422ba68d805feef46aef"
          />
          <AvatarFallback>R</AvatarFallback>
        </Avatar>
        <div className="hidden flex-col items-center md:flex">
          <span className="font-semibold text-sm">Roman</span>
          <span className="text-xs">CEO</span>
        </div>
      </div>

      {/* Message */}
      <div className="relative flex flex-col">
        <p className="font-medium text-sm">{t("announcements.ceoChatTitle")}</p>
        <p className="line-clamp-2 font-semibold text-base md:text-2xl">
          {t("announcements.ceoChatSubtitle")}
        </p>
      </div>

      {/* CTA */}
      <Button
        aria-label={`${t("announcements.ceoChatCta")} — Roman, CEO`}
        className="relative text-card-foreground"
        nativeButton={false}
        render={
          <a href={CEO_CHAT_URL} rel="noopener noreferrer" target="_blank" />
        }
        variant="outline"
      >
        {t("announcements.ceoChatCta")}
      </Button>
    </div>
  );
}
