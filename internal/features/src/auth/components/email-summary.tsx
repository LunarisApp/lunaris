import { Button } from "@lunarisapp/ui/components/button";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAuthRedirect } from "../redirect";

export function EmailSummary({ email }: { email: string }) {
  const { t } = useTranslation();
  const { pathWithRedirect } = useAuthRedirect();

  return (
    <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="min-w-0 truncate text-sm">{email}</span>
      <Button
        className="h-auto shrink-0 p-0"
        nativeButton={false}
        render={<Link state={{ email }} to={pathWithRedirect("/auth")} />}
        variant="link"
      >
        {t("auth.changeEmail")}
      </Button>
    </div>
  );
}
