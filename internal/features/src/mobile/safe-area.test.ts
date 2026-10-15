import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mobileHeaderSource = readFileSync(
  resolve(process.cwd(), "src/mobile/mobile-header.tsx"),
  "utf8"
);

const drawerSource = readFileSync(
  resolve(process.cwd(), "../../packages/ui/src/components/drawer.tsx"),
  "utf8"
);

const sheetSource = readFileSync(
  resolve(process.cwd(), "../../packages/ui/src/components/sheet.tsx"),
  "utf8"
);

describe("mobile safe-area styling", () => {
  it("adds safe-area padding to mobile header", () => {
    expect(mobileHeaderSource).toContain("pt-[var(--safe-area-top)]");
    expect(mobileHeaderSource).toContain(
      "pl-[calc(0.75rem+var(--safe-area-left))]"
    );
    expect(mobileHeaderSource).toContain(
      "pr-[calc(0.75rem+var(--safe-area-right))]"
    );
  });

  it("adds safe-area padding to bottom drawer content", () => {
    expect(drawerSource).toContain(
      "data-[swipe-direction=down]:pb-[var(--safe-area-bottom)]"
    );
  });

  it("adds safe-area padding to bottom sheet content", () => {
    expect(sheetSource).toContain("data-[side=bottom]:pb-[var(--safe-area-bottom)]");
  });
});
