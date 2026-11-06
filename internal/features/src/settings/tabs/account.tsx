"use client";

import { InputConfirmationDialog } from "@lunarisapp/ui/blocks/input-confirmation-dialog";
import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@lunarisapp/ui/components/avatar";
import { Button } from "@lunarisapp/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@lunarisapp/ui/components/input-group";
import { Label } from "@lunarisapp/ui/components/label";
import { Separator } from "@lunarisapp/ui/components/separator";
import { Spinner } from "@lunarisapp/ui/components/spinner";
import {
  Camera01Icon,
  HugeiconsIcon,
  Mail01Icon,
  UserIcon,
} from "@lunarisapp/ui/icons";
import { usePlatform } from "@repo/platform";
import { getInitials } from "@repo/utils";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApi } from "../../api";
import {
  UserAvatar,
  useAuth,
  useAvatarUpload,
  useAvatarUrl,
  useGravatarUrl,
} from "../../auth";
import { SsoButtons } from "../../auth/components/sso-buttons";
import { RegionSummary, useRegion } from "../../region";
import { SecurityContent } from "./security";

function ProfileSection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const [name, setName] = useState("");
  const [nameInitialized, setNameInitialized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useAvatarUpload();

  const user = session?.user;
  const isAnonymous = user?.isAnonymous ?? false;
  const avatarUrl = useAvatarUrl(user?.image ? user.id : undefined);
  const gravatarUrl = useGravatarUrl(user?.email, 128);
  const avatarSrc = avatarUrl ?? gravatarUrl;

  // Initialize name from session once
  if (user?.name && !nameInitialized) {
    setName(user.name);
    setNameInitialized(true);
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      await upload(file);
      toast.success(t("settings.account.avatarUpdated"));
      posthog.capture("avatar_updated");
    } catch (err) {
      log.error({
        tag: "Account",
        msg: "avatar upload failed",
        error: parseError(err),
      });
      toast.error(t("settings.account.avatarUploadFailed"));
    }
    e.target.value = "";
  };

  const handleBlur = async () => {
    if (!name.trim() || name === user?.name) {
      return;
    }
    try {
      await auth.updateUser({ name: name.trim() });
      toast.success(t("organization.updated"));
      posthog.capture("profile_name_updated");
    } catch (e) {
      log.error({
        tag: "Account",
        msg: "name update failed",
        error: parseError(e),
      });
      toast.error(t("common.error"));
      setName(user?.name ?? "");
    }
  };

  return (
    <section
      aria-labelledby="account-profile-heading"
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
      data-testid="settings-account-profile"
    >
      <h2 className="font-semibold text-base" id="account-profile-heading">
        {t("settings.account.profile")}
      </h2>
      <div className="flex max-w-3xl flex-col items-start gap-5 sm:flex-row sm:gap-6">
        <div>
          {isAnonymous ? (
            <UserAvatar size="xl" user={user} />
          ) : (
            <button
              aria-busy={uploading}
              aria-label={t("settings.account.changeAvatar")}
              className="relative cursor-pointer rounded-full transition-all duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Avatar size="xl">
                <AvatarImage
                  alt={user?.name ?? ""}
                  src={avatarSrc ?? undefined}
                />
                <AvatarFallback>{getInitials(user?.name)}</AvatarFallback>
                <AvatarBadge>
                  {uploading ? (
                    <Spinner className="size-3" />
                  ) : (
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="size-3"
                      icon={Camera01Icon}
                      strokeWidth={2}
                    />
                  )}
                </AvatarBadge>
              </Avatar>
            </button>
          )}
          {!isAnonymous && (
            <input
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelect}
              ref={fileInputRef}
              type="file"
            />
          )}
        </div>
        <div className="w-full flex-1 space-y-4">
          {isAnonymous ? (
            <>
              <p className="font-medium">{t("settings.account.anonymous")}</p>
              <p className="text-muted-foreground text-sm">
                {t("settings.account.anonymousDescription")}
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="account-name">
                  {t("settings.account.name")}
                </Label>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={UserIcon}
                        strokeWidth={2}
                      />
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete="name"
                    data-testid="settings-account-name"
                    id="account-name"
                    onBlur={handleBlur}
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    value={name}
                  />
                </InputGroup>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account-email">
                  {t("settings.account.email")}
                </Label>
                <InputGroup className="cursor-not-allowed">
                  <InputGroupAddon>
                    <InputGroupText>
                      <HugeiconsIcon
                        aria-hidden="true"
                        icon={Mail01Icon}
                        strokeWidth={2}
                      />
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    autoComplete="off"
                    disabled
                    id="account-email"
                    type="email"
                    value={user?.email ?? ""}
                  />
                </InputGroup>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DangerZoneSection() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session } = auth.useSession();
  const api = useApi();
  const [open, setOpen] = useState(false);

  const email = session?.user?.email ?? "";

  const handleDeleteRequest = async () => {
    try {
      await api.post("/v1/account/delete-request");
      posthog.capture("account_delete_requested");
      setOpen(false);
      toast.success(t("settings.account.deleteRequestSent"));
    } catch (err) {
      log.error({
        tag: "Account",
        msg: "deletion request failed",
        error: parseError(err),
      });
      toast.error(t("common.error"));
    }
  };

  return (
    <section
      aria-labelledby="account-danger-zone-heading"
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2
        className="font-semibold text-base text-destructive"
        id="account-danger-zone-heading"
      >
        {t("settings.account.dangerZone")}
      </h2>
      <div className="flex max-w-3xl flex-col gap-4 rounded-xl border border-destructive/20 bg-destructive/[0.025] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-destructive text-sm">
            {t("settings.account.deleteAccount")}
          </p>
          <p className="text-destructive/80 text-sm">
            {t("settings.account.deleteConfirmDescription")}
          </p>
        </div>
        <Button
          className="h-11 w-full shrink-0 lg:h-8 lg:w-auto"
          onClick={() => setOpen(true)}
          size="sm"
          variant="destructive"
        >
          {t("settings.account.deleteAccount")}
        </Button>
        <InputConfirmationDialog
          cancelLabel={t("common.cancel")}
          confirmationText={email}
          confirmLabel={t("settings.account.deleteAccount")}
          description={t("settings.account.deleteConfirmDescription")}
          onConfirm={handleDeleteRequest}
          onOpenChange={setOpen}
          open={open}
          title={t("settings.account.deleteConfirmTitle")}
        />
      </div>
    </section>
  );
}

function ClaimAccountSection() {
  const { t } = useTranslation();
  const { navigation } = usePlatform();
  const { pathWithRegion } = useRegion();

  return (
    <section
      aria-labelledby="account-claim-heading"
      className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
    >
      <h2 className="font-semibold text-base" id="account-claim-heading">
        {t("settings.account.claimAccount")}
      </h2>
      <div className="max-w-3xl space-y-4">
        <p className="text-muted-foreground text-sm">
          {t("settings.account.claimAccountDescription")}
        </p>
        <SsoButtons />
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-muted-foreground text-sm">{t("auth.or")}</span>
          <Separator className="flex-1" />
        </div>
        <Button
          className="h-11 w-full"
          data-testid="settings-account-claim-email"
          onClick={() => navigation.assign(pathWithRegion("/auth/register"))}
          variant="outline"
        >
          <HugeiconsIcon aria-hidden="true" icon={Mail01Icon} strokeWidth={2} />
          {t("auth.continueWithEmail")}
        </Button>
      </div>
    </section>
  );
}

export function AccountContent() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { data: session } = auth.useSession();

  const isAnonymous = session?.user?.isAnonymous ?? false;

  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-12"
      data-testid="settings-panel-account"
    >
      <div className="space-y-6">
        <ProfileSection />
        <RegionSummary variant="plain" />
      </div>

      {isAnonymous ? (
        <ClaimAccountSection />
      ) : (
        <>
          <section
            aria-labelledby="account-security-heading"
            className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
          >
            <header className="space-y-1.5">
              <h2
                className="font-semibold text-base"
                id="account-security-heading"
              >
                {t("settings.security.title")}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t("settings.security.description")}
              </p>
            </header>
            <div className="min-w-0 max-w-3xl">
              <SecurityContent />
            </div>
          </section>
          <DangerZoneSection />
        </>
      )}
    </div>
  );
}
