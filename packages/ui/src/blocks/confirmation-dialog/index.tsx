"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lunarisapp/ui/components/alert-dialog";
import type { ComponentProps } from "react";

interface ConfirmationDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: ComponentProps<typeof AlertDialogAction>["variant"];
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  description,
  onConfirm,
  title = "Are you sure?",
  cancelLabel = "Cancel",
  confirmLabel = "Continue",
  confirmVariant,
}: ConfirmationDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant={confirmVariant}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
