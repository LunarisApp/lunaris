"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import { Input } from "@lunarisapp/ui/components/input";
import { useState } from "react";

interface RenameDialogProps {
  cancelLabel?: string;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (newName: string) => void;
  open: boolean;
  placeholder?: string;
  submitLabel?: string;
  title: string;
}

export function RenameDialog({
  open,
  onOpenChange,
  initialName,
  onSubmit,
  title,
  placeholder,
  cancelLabel = "Cancel",
  submitLabel = "Save",
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(initialName);
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onSubmit(trimmed);
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <Input
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            value={name}
          />
          <DialogFooter className="mt-4">
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              {cancelLabel}
            </Button>
            <Button disabled={!name.trim()} type="submit">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
