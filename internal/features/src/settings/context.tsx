"use client";

import posthog from "posthog-js";
import { useMemo } from "react";
import { useNavigate } from "react-router";

/**
 * Navigation helper for opening the settings page. Settings is a full
 * route (`/settings`) on both shells, so this hook just wraps navigation
 * with analytics.
 */
export function useSettings() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      open: () => {
        posthog.capture("settings_opened");
        navigate("/settings");
      },
    }),
    [navigate]
  );
}
