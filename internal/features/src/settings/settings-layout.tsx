"use client";

import { Separator } from "@lunarisapp/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@lunarisapp/ui/components/sidebar";
import {
  ArrowLeft01Icon,
  HugeiconsIcon,
  type IconSvgObject,
} from "@lunarisapp/ui/icons";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";

export interface SettingsNavigationItem {
  description?: ReactNode;
  icon: IconSvgObject;
  id: string;
  isActive: boolean;
  isPending?: boolean;
  label: string;
  onSelect?: () => void;
  testId?: string;
  to?: string;
}

interface SettingsLayoutProps {
  backLabel: string;
  backTo: string;
  children: ReactNode;
  contentDescription?: ReactNode;
  contentTitle: string;
  footer?: ReactNode;
  headerActions?: ReactNode;
  items: SettingsNavigationItem[];
  skipToContentLabel: string;
  testId?: string;
  title: string;
}

function SettingsNavigation({
  items,
  title,
}: Pick<SettingsLayoutProps, "items" | "title">) {
  const { isMobile, setOpenMobile } = useSidebar();

  const selectItem = (item: SettingsNavigationItem) => {
    item.onSelect?.();
    if (isMobile) setOpenMobile(false);
  };

  return (
    <nav aria-label={title}>
      <SidebarGroup>
        <SidebarGroupLabel className="h-auto min-h-8 py-1.5 text-sm font-semibold leading-tight text-sidebar-foreground/70">
          {title}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">
            {items.map((item) => (
              <SidebarMenuItem key={item.id}>
                {item.isPending ? (
                  <div
                    aria-hidden="true"
                    className="flex h-8 items-center gap-2 rounded-md px-2 in-data-[mobile=true]:h-12 in-data-[mobile=true]:px-3"
                  >
                    <div className="size-4 rounded bg-sidebar-accent" />
                    <div className="h-4 w-24 rounded bg-sidebar-accent" />
                  </div>
                ) : (
                <SidebarMenuButton
                  aria-current={item.isActive ? "page" : undefined}
                  className="in-data-[mobile=true]:h-12 in-data-[mobile=true]:px-3"
                  data-testid={item.testId}
                  isActive={item.isActive}
                  onClick={() => selectItem(item)}
                  render={item.to ? <Link replace to={item.to} /> : undefined}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={item.icon}
                    strokeWidth={2}
                  />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}

export function SettingsLayout({
  backLabel,
  backTo,
  children,
  contentDescription,
  contentTitle,
  footer,
  headerActions,
  items,
  skipToContentLabel,
  testId,
  title,
}: SettingsLayoutProps) {
  const navigate = useNavigate();

  return (
    <SidebarProvider
      className="h-dvh min-h-0 overflow-hidden"
      data-testid={testId}
    >
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2"
        href="#settings-content"
      >
        {skipToContentLabel}
      </a>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader className="p-2">
          <Link
            aria-label="Lunaris"
            className="flex h-12 items-center gap-2.5 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            to={backTo}
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden">
              <img
                alt=""
                className="size-7 shrink-0 dark:hidden"
                draggable={false}
                height={28}
                src="/favicon-light.svg"
                width={28}
              />
              <img
                alt=""
                className="hidden size-7 shrink-0 dark:block"
                draggable={false}
                height={28}
                src="/favicon-dark.svg"
                width={28}
              />
            </span>
            <span className="text-base/none font-[650] tracking-[0.04em] uppercase">
              Lunaris
            </span>
          </Link>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="in-data-[mobile=true]:h-12 in-data-[mobile=true]:px-3"
                onClick={() => navigate(-1)}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={ArrowLeft01Icon}
                  strokeWidth={2}
                />
                <span>{backLabel}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SettingsNavigation items={items} title={title} />
        </SidebarContent>

        {footer ? (
          <SidebarFooter className="text-muted-foreground text-xs">
            {footer}
          </SidebarFooter>
        ) : null}
      </Sidebar>

      <SidebarInset
        className="min-h-0 overflow-hidden"
        id="settings-content"
        tabIndex={-1}
      >
        <header className="flex min-h-20 shrink-0 items-center gap-3 border-b px-4 py-3 md:px-6">
          <SidebarTrigger className="md:hidden" />
          <Separator className="h-8 md:hidden" orientation="vertical" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {contentTitle}
            </h1>
            {contentDescription ? (
              <p className="text-muted-foreground truncate text-sm">
                {contentDescription}
              </p>
            ) : null}
          </div>
          {headerActions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {headerActions}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full px-4 py-6 sm:px-6 md:px-8 md:py-10 lg:px-10">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
