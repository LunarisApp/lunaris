import { Button } from "@lunarisapp/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import { HugeiconsIcon, Moon02Icon, Sun } from "@lunarisapp/ui/icons";

export function ThemeToggle({
  setTheme,
  size,
}: {
  setTheme: (theme: "light" | "dark" | "system") => void;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size={!size || size === "md" ? "icon" : `icon-${size}`}
            variant="outline"
          >
            <HugeiconsIcon
              className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
              icon={Sun}
            />
            <HugeiconsIcon
              className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
              icon={Moon02Icon}
            />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
