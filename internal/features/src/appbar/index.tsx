import { cn } from "@lunarisapp/ui/lib/utils";
import {
  Activity,
  createContext,
  useContext,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";

const AppToolActive = createContext(true);

export function useAppToolActive() {
  return useContext(AppToolActive);
}

export function AppToolVisibility({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const scope = useId();
  return (
    <AppToolActive.Provider value={active}>
      <HotkeysProvider scope={scope} enabled={active}>
        {children}
      </HotkeysProvider>
    </AppToolActive.Provider>
  );
}

export function Appbar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  const active = useAppToolActive();
  return (
    <Activity mode={active ? "visible" : "hidden"}>
      <header
        className={cn(
          "flex h-12 items-center justify-between px-2.5",
          className
        )}
        {...props}
      />
    </Activity>
  );
}

function AppbarSection({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex min-w-0 flex-1 items-center gap-2", className)}
      {...props}
    />
  );
}

Appbar.Leading = function AppbarLeading({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppbarSection className={cn("justify-start", className)} {...props} />
  );
};

Appbar.Trailing = function AppbarTrailing({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <AppbarSection className={cn("justify-end", className)} {...props} />;
};

Appbar.Middle = function AppbarMiddle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <AppbarSection className={cn("justify-center", className)} {...props} />
  );
};
