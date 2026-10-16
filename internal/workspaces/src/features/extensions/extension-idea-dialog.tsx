"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@lunarisapp/ui/components/dialog";
import { Label } from "@lunarisapp/ui/components/label";
import { Textarea } from "@lunarisapp/ui/components/textarea";
import {
  Cancel01Icon,
  HugeiconsIcon,
  PlusSignIcon,
  Tick02Icon,
} from "@lunarisapp/ui/icons";
import { useApi } from "@repo/features/api";
import { log, parseError } from "evlog";
import posthog from "posthog-js";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

type SubmissionStatus = "idle" | "submitting" | "success" | "error";

export function ExtensionIdeaDialog() {
  const { t } = useTranslation();
  const api = useApi();
  const [idea, setIdea] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>("idle");

  const handleOpenChange = (nextOpen: boolean) => {
    if (status === "submitting") {
      return;
    }

    setOpen(nextOpen);
    if (!nextOpen) {
      setIdea("");
      setStatus("idle");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!idea.trim() || status === "submitting") {
      return;
    }

    setStatus("submitting");
    try {
      await api.post("/v1/extension-requests", {
        body: { idea: idea.trim() },
      });
      posthog.capture("extension_idea_submitted");
      setStatus("success");
    } catch (error) {
      log.error({
        error: parseError(error),
        msg: "extension idea submission failed",
        tag: "Extensions",
      });
      posthog.capture("extension_idea_failed");
      setStatus("error");
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={<Button className="@xl:w-auto w-full" variant="outline" />}
      >
        <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
        {t("extensions.interestTrigger")}
      </DialogTrigger>
      <DialogContent
        aria-busy={status === "submitting"}
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        {status === "success" ? (
          <>
            <DialogHeader className="grid grid-cols-[2.5rem_minmax(0,1fr)_1.75rem] items-center gap-x-4 border-b bg-muted/40 px-6 py-5">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              >
                <HugeiconsIcon
                  className="size-5"
                  icon={Tick02Icon}
                  strokeWidth={2}
                />
              </span>
              <DialogTitle className="min-w-0 break-words text-lg leading-tight">
                {t("extensions.interestSuccessTitle")}
              </DialogTitle>
              <DialogClose
                render={
                  <Button
                    aria-label={t("common.close")}
                    className="justify-self-end"
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </DialogClose>
            </DialogHeader>
            <div aria-live="polite" className="min-h-0 overflow-y-auto p-6">
              <DialogDescription>
                {t("extensions.interestSuccessDescription")}
              </DialogDescription>
            </div>
            <DialogFooter className="m-0 shrink-0 flex-col rounded-none px-6 py-4">
              <DialogClose render={<Button autoFocus />}>
                {t("common.done")}
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form className="contents" onSubmit={handleSubmit}>
            <DialogHeader className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-center gap-x-4 gap-y-1 border-b bg-muted/40 px-6 py-5">
              <DialogTitle className="min-w-0 break-words text-lg leading-tight">
                {t("extensions.interestTitle")}
              </DialogTitle>
              <DialogClose
                render={
                  <Button
                    aria-label={t("common.close")}
                    className="justify-self-end"
                    disabled={status === "submitting"}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </DialogClose>
              <DialogDescription className="col-span-2 min-w-0 break-words leading-relaxed">
                {t("extensions.interestDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 space-y-2 overflow-y-auto p-6">
              <Label htmlFor="extension-idea">
                {t("extensions.interestIdeaLabel")}
              </Label>
              <Textarea
                aria-describedby={
                  status === "error" ? "extension-request-error" : undefined
                }
                aria-invalid={status === "error" || undefined}
                autoFocus
                className="max-h-64 min-h-32 resize-y overflow-y-auto bg-muted/30 focus-visible:bg-background"
                disabled={status === "submitting"}
                id="extension-idea"
                maxLength={2000}
                onChange={(event) => {
                  setIdea(event.target.value);
                  if (status === "error") {
                    setStatus("idle");
                  }
                }}
                placeholder={t("extensions.interestIdeaPlaceholder")}
                required
                value={idea}
              />
              {status === "error" && (
                <p
                  aria-live="polite"
                  className="text-destructive text-sm"
                  id="extension-request-error"
                  role="alert"
                >
                  {t("extensions.interestError")}
                </p>
              )}
            </div>
            <DialogFooter className="m-0 shrink-0 flex-col rounded-none px-6 py-4">
              <DialogClose
                render={
                  <Button
                    disabled={status === "submitting"}
                    variant="outline"
                  />
                }
              >
                {t("common.cancel")}
              </DialogClose>
              <Button
                disabled={!idea.trim() || status === "submitting"}
                type="submit"
              >
                {status === "submitting"
                  ? t("extensions.interestSubmitting")
                  : t("extensions.interestSubmit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
