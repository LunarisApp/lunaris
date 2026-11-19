"use client";

import {
  Drawer,
  DrawerMenuItem,
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
import { Separator } from "@lunarisapp/ui/components/separator";
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
    const { render, children, handle: _menuHandle, ...rest } = props;
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
              "px-4 pb-2 text-center font-medium text-muted-foreground text-sm",
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
    // Menu items render a div; mobile drawers render a native button.
    // Drawers use native button focus and don't have a highlighted menu item.
    const {
      render: _render,
      nativeButton: _nativeButton,
      label: _typeaheadLabel,
      closeOnClick = true,
      disabled = false,
      inset,
      style,
      ...buttonProps
    } = props;
    const state = { disabled, highlighted: false };
    const nativeProps = buttonProps as unknown as ComponentProps<"button">;
    return (
      <DrawerMenuItem
        {...nativeProps}
        className={
          typeof className === "function" ? className(state) : className
        }
        data-inset={inset || undefined}
        disabled={disabled}
        onClick={(event) => {
          nativeProps.onClick?.(event);
          if (!closeOnClick) {
            event.preventBaseUIHandler();
          }
        }}
        style={typeof style === "function" ? style(state) : style}
        variant={variant}
      >
        {children}
      </DrawerMenuItem>
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
    return <Separator className={cn("my-1", className)} />;
  }

  return <DropdownMenuSeparator className={className} {...props} />;
}

function ResponsiveDropdownMenuShortcut(
  props: ComponentProps<typeof DropdownMenuShortcut>
) {
  const isMobile = useContext(IsMobileContext);

  // Hide keyboard shortcuts on mobile
  if (isMobile) {
    return null;
  }

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
