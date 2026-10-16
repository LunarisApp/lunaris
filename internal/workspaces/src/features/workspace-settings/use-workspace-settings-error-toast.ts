"use client";

import { getUserFacingDescription, getUserFacingError } from "@repo/data/http";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function useWorkspaceSettingsErrorToast() {
  const { t } = useTranslation();

  return useCallback(
    (error: unknown) => {
      const userError = getUserFacingError(error);
      toast.error(t(userError.titleKey), {
        description: getUserFacingDescription(userError, t),
      });
    },
    [t]
  );
}
