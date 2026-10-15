"use client";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@lunarisapp/ui/components/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@lunarisapp/ui/components/dropdown-menu";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { cn } from "@lunarisapp/ui/lib/utils";
import {
  type ComponentProps,
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
} from "react";

const IsMobileContext = createContext(false);

function ResponsiveDropdownMenu({
  children,
  ...props
}: { children: ReactNode } & Record<string, unknown>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <IsMobileContext.Provider value={true}>
        <Drawer {...props}>{children}</Drawer>
      </IsMobileContext.Provider>
    );
  }

  return (
    <IsMobileContext.Provider value={false}>
      <DropdownMenu {...props}>{children}</DropdownMenu>
    </IsMobileContext.Provider>
  );
}

function ResponsiveDropdownMenuTrigger(
  props: ComponentProps<typeof DropdownMenuTrigger>
) {
  const isMobile = useContext(IsMobileContext);

  if (isMobile) {
    const { render, children, ...rest } = props as any;
    if (render && isValidElement(render)) {
      return (
        <DrawerTrigger
          render={children ? cloneElement(render, {}, children) : render}
          {...rest}
        />
      );
    }
    return <DrawerTrigger {...rest}>{children}</DrawerTrigger>;
  }

  return <DropdownMenuTrigger {...props} />;
}

function ResponsiveDropdownMenuContent({
  children,
  className,
  title,
  ...props
}: ComponentProps<typeof DropdownMenuContent> & { title?: string }) {
  const isMobile = useContext(IsMobileContext);

  if (isMobile) {
    return (
      <DrawerContent aria-describedby={undefined}>
        <div className="py-4">
          <DrawerTitle
            className={cn(
              "px-4 pb-2 text-center text-sm font-medium text-muted-foreground",
              !title && "sr-only"
            )}
          >
            {title ?? "Menu"}
          </DrawerTitle>
          <div className="flex flex-col gap-0.5 px-2">{children}</div>
        </div>
      </DrawerContent>
    );
  }

  return (
    <DropdownMenuContent className={className} {...props}>
      {children}
    </DropdownMenuContent>
  );
}

function ResponsiveDropdownMenuItem({
  className,
  variant = "default",
  children,
  ...props
}: ComponentProps<typeof DropdownMenuItem>) {
  const isMobile = useContext(IsMobileContext);

  if (isMobile) {
    const { onClick, disabled, ...rest } = props as any;
    return (
      <DrawerClose
        render={
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors active:bg-accent [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
              variant === "destructive" && "text-destructive",
              disabled && "pointer-events-none opacity-50",
              className
            )}
            disabled={disabled}
            onClick={onClick}
            type="button"
            {...rest}
          >
            {children}
          </button>
        }
      />
    );
  }

  return (
    <DropdownMenuItem className={className} variant={variant} {...props}>
      {children}
    </DropdownMenuItem>
  );
}

function ResponsiveDropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuSeparator>) {
  const isMobile = useContext(IsMobileContext);

  if (isMobile) {
    return <div className={cn("my-1 h-px bg-border", className)} />;
  }

  return <DropdownMenuSeparator className={className} {...props} />;
}

function ResponsiveDropdownMenuShortcut(
  props: ComponentProps<typeof DropdownMenuShortcut>
) {
  const isMobile = useContext(IsMobileContext);

  // Hide keyboard shortcuts on mobile
  if (isMobile) return null;

  return <DropdownMenuShortcut {...props} />;
}

export {
  ResponsiveDropdownMenu,
  ResponsiveDropdownMenuContent,
  ResponsiveDropdownMenuItem,
  ResponsiveDropdownMenuSeparator,
  ResponsiveDropdownMenuShortcut,
  ResponsiveDropdownMenuTrigger,
};
