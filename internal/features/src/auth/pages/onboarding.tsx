import { Button } from "@lunarisapp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lunarisapp/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@lunarisapp/ui/components/input-group";
import {
  BookOpen01Icon,
  Briefcase01Icon,
  Home01Icon,
  HugeiconsIcon,
  More01Icon,
  QuillWrite01Icon,
} from "@lunarisapp/ui/icons";
import posthog from "posthog-js";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { useAuth } from "../context";
import { useAuthRedirect } from "../redirect";

const PENDING_KEY = "lunaris_pending_onboarding";
const COMPLETED_KEY = "lunaris_onboarding_completed";

type Purpose = "personal" | "work" | "academic" | "writing" | "other";

const PRESET_OPTIONS: {
  value: Exclude<Purpose, "other">;
  labelKey: string;
  icon: typeof Home01Icon;
}[] = [
  {
    value: "personal",
    labelKey: "auth.onboarding.purposePersonal",
    icon: Home01Icon,
  },
  {
    value: "work",
    labelKey: "auth.onboarding.purposeWork",
    icon: Briefcase01Icon,
  },
  {
    value: "academic",
    labelKey: "auth.onboarding.purposeAcademic",
    icon: BookOpen01Icon,
  },
  {
    value: "writing",
    labelKey: "auth.onboarding.purposeWriting",
    icon: QuillWrite01Icon,
  },
];

function completeOnboarding() {
  localStorage.removeItem(PENDING_KEY);
  localStorage.setItem(COMPLETED_KEY, "true");
}

export default function OnboardingPage({
  buildVersion,
}: {
  buildVersion?: ReactNode;
}) {
  const auth = useAuth();
  const { data: session, isPending } = auth.useSession();
  const { resolvedRedirectTo } = useAuthRedirect();

  if (isPending) {
    return null;
  }
  if (!session) {
    return <Navigate replace to="/auth" />;
  }
  if (localStorage.getItem(COMPLETED_KEY)) {
    return <Navigate replace to={resolvedRedirectTo} />;
  }

  return (
    <OnboardingContent
      buildVersion={buildVersion}
      redirectTo={resolvedRedirectTo}
      userId={session.user.id}
    />
  );
}

function OnboardingContent({
  buildVersion,
  redirectTo,
  userId,
}: {
  buildVersion?: ReactNode;
  redirectTo: string;
  userId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Purpose | null>(null);
  const [otherText, setOtherText] = useState("");
  const canContinue = selected !== null;

  const handleContinue = () => {
    if (!canContinue) {
      return;
    }
    const purposeDetail =
      selected === "other" ? otherText.trim().toLowerCase() : undefined;
    posthog.capture("onboarding_purpose_selected", {
      purpose: selected,
      ...(purposeDetail && { purpose_detail: purposeDetail }),
    });
    posthog.identify(userId, { purpose: selected });
    completeOnboarding();
    navigate(redirectTo, { replace: true });
  };

  const handleSelectPreset = (value: Exclude<Purpose, "other">) => {
    setSelected(value);
    setOtherText("");
  };

  return (
    <main
      className="flex min-h-svh w-full items-center justify-center"
      data-testid="auth-onboarding"
    >
      <div className="flex w-full max-w-md flex-col gap-4 px-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1>{t("auth.onboarding.title")}</h1>
            </CardTitle>
            <CardDescription>
              {t("auth.onboarding.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-4">
              <legend className="sr-only">{t("auth.onboarding.title")}</legend>
              <div className="grid grid-cols-2 gap-3">
                {PRESET_OPTIONS.map(({ value, labelKey, icon }) => (
                  <Button
                    aria-pressed={selected === value}
                    className="h-auto flex-col gap-2 whitespace-normal p-4"
                    data-testid={`auth-onboarding-${value}`}
                    key={value}
                    onClick={() => handleSelectPreset(value)}
                    type="button"
                    variant={selected === value ? "default" : "outline"}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="size-5"
                      icon={icon}
                      strokeWidth={2}
                    />
                    {t(labelKey)}
                  </Button>
                ))}
              </div>
              <InputGroup
                className="h-12 data-selected:border-primary"
                data-selected={selected === "other" || undefined}
              >
                <InputGroupAddon>
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={More01Icon}
                    strokeWidth={2}
                  />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t("auth.onboarding.purposeOther")}
                  className="h-full"
                  data-testid="auth-onboarding-other"
                  id="auth-onboarding-other"
                  onChange={(e) => setOtherText(e.target.value)}
                  onFocus={() => setSelected("other")}
                  placeholder={t("auth.onboarding.otherPlaceholder")}
                  value={otherText}
                />
              </InputGroup>
            </fieldset>
            <Button
              className="touch-target w-full"
              data-testid="auth-onboarding-continue"
              disabled={!canContinue}
              onClick={handleContinue}
            >
              {t("common.continue")}
            </Button>
          </CardContent>
        </Card>
        {buildVersion}
      </div>
    </main>
  );
}
