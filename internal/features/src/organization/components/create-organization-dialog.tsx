import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@lunarisapp/ui/components/field";
import { Input } from "@lunarisapp/ui/components/input";
import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "../../auth/context";
import { useRegion } from "../../region";
import { markPendingOrganization } from "../pending-organization";
import { isValidOrganizationSlug } from "../schemas";
import { slugifyOrganizationName } from "../utils";

interface CreateOrganizationDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateOrganizationDialog({
  onOpenChange,
  open,
}: CreateOrganizationDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useAuth();
  const { refetch: refetchSession } = auth.useSession();
  const { refetch: refetchActiveOrganization } = auth.useActiveOrganization();
  const { pathWithRegion } = useRegion();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string>();

  useEffect(() => {
    if (!open) return;

    setName("");
    setSlug("");
    setSlugEdited(false);
    setSlugError(undefined);
    setSubmitting(false);
  }, [open]);

  const trimmedName = name.trim();
  const trimmedSlug = slug.trim();
  const canSubmit = Boolean(trimmedName) && Boolean(trimmedSlug) && !slugError;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      setSlug(slugifyOrganizationName(value));
      setSlugError(undefined);
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(value);
    setSlugError(undefined);
  };

  const validateSlug = async () => {
    if (!trimmedSlug) {
      setSlugError(t("organization.slugRequired"));
      return false;
    }

    if (!isValidOrganizationSlug(trimmedSlug)) {
      setSlugError(t("organization.slugInvalid"));
      return false;
    }

    const { data, error } = await auth.organization.checkSlug({
      slug: trimmedSlug,
    });

    if (error || !data?.status) {
      setSlugError(t("organization.slugTaken"));
      return false;
    }

    setSlugError(undefined);
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !trimmedName) return;

    setSubmitting(true);

    try {
      const slugOk = await validateSlug();
      if (!slugOk) return;

      const { data, error } = await auth.organization.create({
        keepCurrentActiveOrganization: false,
        name: trimmedName,
        slug: trimmedSlug,
      });

      if (error || !data) {
        if (
          (error as { code?: string } | null)?.code ===
          "ORGANIZATION_SLUG_ALREADY_TAKEN"
        ) {
          setSlugError(t("organization.slugTaken"));
          return;
        }
        const ufe = getUserFacingError(error);
        toast.error(t(ufe.titleKey), {
          description: getUserFacingDescription(ufe, t),
        });
        return;
      }

      posthog.capture("organization_created");
      toast.success(t("organization.created"));
      onOpenChange(false);
      markPendingOrganization({
        id: data.id,
        name: trimmedName,
        slug: data.slug,
      });
      // Creation changes the server's active organization. Refresh both stores
      // before routing so the guard never sees the old session paired with it.
      await Promise.all([
        refetchSession({ query: { disableCookieCache: true } }),
        refetchActiveOrganization(),
      ]);
      navigate(pathWithRegion(`/${data.slug}`));
    } catch (error) {
      log.error({
        error: parseError(error),
        msg: "organization creation failed",
        tag: "CreateOrganizationDialog",
      });
      const userFacingError = getUserFacingError(error);
      toast.error(t(userFacingError.titleKey), {
        description: getUserFacingDescription(userFacingError, t),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="organization-create-dialog">
        <DialogHeader>
          <DialogTitle>{t("organization.createOrganization")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field>
            <FieldLabel htmlFor="create-organization-name">
              {t("organization.name")}
            </FieldLabel>
            <Input
              autoComplete="off"
              autoFocus
              data-testid="organization-create-name"
              id="create-organization-name"
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder={t("organization.createOrganizationPlaceholder")}
              value={name}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="create-organization-slug">
              {t("organization.slug")}
            </FieldLabel>
            <Input
              aria-invalid={!!slugError}
              autoComplete="off"
              data-testid="organization-create-slug"
              id="create-organization-slug"
              onBlur={() => {
                if (!trimmedSlug) return;
                void validateSlug();
              }}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder={t("organization.slugHint")}
              value={slug}
            />
            <FieldError
              data-testid="organization-create-slug-error"
              errors={[slugError ? { message: slugError } : undefined]}
            />
          </Field>

          <DialogFooter>
            <Button
              data-testid="organization-create-cancel"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              data-testid="organization-create-submit"
              disabled={!canSubmit || submitting}
              type="submit"
            >
              {t("organization.createOrganization")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
