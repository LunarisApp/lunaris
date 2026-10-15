import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/context";
import abstractBg from "../assets/abstract_bg.webp";

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
    () => subtitles[Math.floor(Math.random() * subtitles.length)],
  );

  return (
    <div
      className="relative flex h-40 w-full flex-col justify-center overflow-hidden rounded-lg bg-cover bg-center px-8"
      style={{ backgroundImage: `url(${abstractBg})` }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <p className="relative text-xl font-semibold text-white">
        {hasName
          ? t("announcements.welcomeTitle", { name: user.name })
          : t("announcements.welcomeTitleGeneric")}
      </p>
      <p className="relative mt-1 text-sm text-white/70">{subtitle}</p>
    </div>
  );
}
