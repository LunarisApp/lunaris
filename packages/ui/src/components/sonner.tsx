"use client";

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  Toaster as Sonner,
  type ToasterProps,
  type ToastT,
  useSonner,
} from "sonner";

/**
 * Extracts text content from a toast for screen reader announcement.
 */
function getToastText(toast: ToastT): string {
  const title =
    typeof toast.title === "function" ? "" : String(toast.title ?? "");
  const description =
    typeof toast.description === "function"
      ? ""
      : String(toast.description ?? "");
  return [title, description].filter(Boolean).join(". ");
}

/**
 * Component that manages aria-live announcements for toasts.
 * Error toasts use assertive, others use polite.
 */
function ToastAnnouncer() {
  const { toasts } = useSonner();
  const [politeMessage, setPoliteMessage] = useState("");
  const [assertiveMessage, setAssertiveMessage] = useState("");
  const announcedIds = useRef<Set<string | number>>(new Set());

  useEffect(() => {
    for (const toast of toasts) {
      if (announcedIds.current.has(toast.id)) {
        continue;
      }
      announcedIds.current.add(toast.id);

      const text = getToastText(toast);
      if (!text) {
        continue;
      }

      if (toast.type === "error") {
        setAssertiveMessage(text);
      } else {
        setPoliteMessage(text);
      }
    }

    // Clean up dismissed toast IDs
    const currentIds = new Set(toasts.map((t) => t.id));
    for (const id of announcedIds.current) {
      if (!currentIds.has(id)) {
        announcedIds.current.delete(id);
      }
    }
  }, [toasts]);

  return (
    <>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {politeMessage}
      </div>
      <div aria-atomic="true" aria-live="assertive" className="sr-only">
        {assertiveMessage}
      </div>
    </>
  );
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <Sonner
        className="toaster group"
        icons={{
          success: (
            <HugeiconsIcon
              className="size-4"
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
            />
          ),
          info: (
            <HugeiconsIcon
              className="size-4"
              icon={InformationCircleIcon}
              strokeWidth={2}
            />
          ),
          warning: (
            <HugeiconsIcon
              className="size-4"
              icon={Alert02Icon}
              strokeWidth={2}
            />
          ),
          error: (
            <HugeiconsIcon
              className="size-4"
              icon={MultiplicationSignCircleIcon}
              strokeWidth={2}
            />
          ),
          loading: (
            <HugeiconsIcon
              className="size-4 animate-spin"
              icon={Loading03Icon}
              strokeWidth={2}
            />
          ),
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--border-radius": "var(--radius)",
          } as CSSProperties
        }
        theme={theme as ToasterProps["theme"]}
        toastOptions={{
          classNames: {
            toast: "cn-toast",
          },
        }}
        {...props}
      />
      <ToastAnnouncer />
    </>
  );
};

export { Toaster };
