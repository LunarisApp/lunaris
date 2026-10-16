/** @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";

describe("DialogContent", () => {
  it("uses the supplied accessible close label", async () => {
    render(
      <Dialog defaultOpen>
        <DialogContent closeLabel="Fermer">
          <DialogTitle>Préférences</DialogTitle>
          <DialogDescription>Modifier les préférences.</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
