import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/context";
import announcementArt from "../assets/abstract_bg.webp";

export function WelcomeBanner() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const user = session?.user;
  const hasName = user?.name && !user.isAnonymous;
  const subtitles = t("announcements.welcomeSubtitles", {
    returnObjects: true,
  }) as string[];
  const [subtitle] = useState(
    () => subtitles[Math.floor(Math.random() * subtitles.length)]
  );

  return (
    <div
      className="relative flex h-40 w-full flex-col justify-center gap-1 overflow-hidden rounded-xl border bg-black bg-center bg-cover px-4 text-white sm:px-8"
      style={{ backgroundImage: `url(${announcementArt})` }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <p className="relative line-clamp-2 font-medium text-lg leading-tight tracking-tight sm:text-xl">
        {hasName
          ? t("announcements.welcomeTitle", { name: user.name })
          : t("announcements.welcomeTitleGeneric")}
      </p>
      <p className="relative text-sm">{subtitle}</p>
    </div>
  );
}
