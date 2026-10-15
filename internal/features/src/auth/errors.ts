import {
  getUserFacingDescription,
  getUserFacingError,
} from "@repo/data/http";
import { toast } from "sonner";

type Translate = Parameters<typeof getUserFacingDescription>[1];

export function getAuthErrorDescription(error: unknown, t: Translate) {
  return getUserFacingDescription(getUserFacingError(error), t);
}

export function showAuthErrorToast(error: unknown, t: Translate) {
  const userFacingError = getUserFacingError(error);
  toast.error(t(userFacingError.titleKey), {
    description: getUserFacingDescription(userFacingError, t),
  });
}
