"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lunarisapp/ui/components/alert-dialog";
import { Button } from "@lunarisapp/ui/components/button";
import { Input } from "@lunarisapp/ui/components/input";
import {
  CheckmarkSquare02Icon,
  Copy01Icon,
  HugeiconsIcon,
} from "@lunarisapp/ui/icons";
import { useCallback, useRef, useState } from "react";

interface InputConfirmationDialogProps {
  cancelLabel?: string;
  confirmationText: string;
  confirmLabel?: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending?: boolean;
  title?: string;
}

export function InputConfirmationDialog({
  open,
  onOpenChange,
  description,
  onConfirm,
  confirmationText,
  pending = false,
  title = "Are you sure?",
  cancelLabel = "Cancel",
  confirmLabel = "Continue",
}: InputConfirmationDialogProps) {
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setInput("");
    }
    onOpenChange(next);
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(confirmationText);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [confirmationText]);

  return (
    <AlertDialog onOpenChange={handleOpenChange} open={open}>
      <AlertDialogContent data-testid="input-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 px-1">
          <label
            className="text-muted-foreground text-sm"
            htmlFor="confirm-input"
          >
            Type{" "}
            <span className="inline-flex h-6 max-w-80 select-none items-center gap-0.5 truncate rounded-lg border border-transparent bg-muted px-2 pr-1 font-medium text-foreground text-sm">
              <span className="select-all font-normal text-sm">
                {confirmationText}
              </span>
              <Button
                aria-label="Copy to clipboard"
                onClick={handleCopy}
                size="icon-xs"
                variant="ghost"
              >
                <HugeiconsIcon
                  icon={copied ? CheckmarkSquare02Icon : Copy01Icon}
                  size={14}
                />
              </Button>
            </span>{" "}
            to confirm
          </label>
          <Input
            autoComplete="off"
            data-testid="input-confirm-input"
            id="confirm-input"
            onChange={(e) => setInput(e.target.value)}
            value={input}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="input-confirm-cancel">
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            data-testid="input-confirm-submit"
            disabled={pending || input !== confirmationText}
            onClick={onConfirm}
            variant="destructive"
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
