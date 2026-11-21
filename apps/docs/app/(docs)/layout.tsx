import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { source } from "../../lib/source";
import { BrandNavigation } from "./brand-navigation";
import { SidebarFooter } from "./sidebar-footer";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      links={[
        {
          type: "custom",
          children: (
            <div className="flex flex-wrap items-center gap-2">
              <a
                className={buttonVariants({
                  variant: "secondary",
                  className: "h-9 whitespace-nowrap px-4 py-0",
                })}
                href="https://web.lunaris.app/auth"
                rel="noreferrer noopener"
                target="_blank"
              >
                Log in
              </a>
              <a
                className={buttonVariants({
                  variant: "primary",
                  className: "h-9 whitespace-nowrap px-4 py-0",
                })}
                href="https://web.lunaris.app/auth/register"
                rel="noreferrer noopener"
                target="_blank"
              >
                Sign up
              </a>
            </div>
          ),
        },
      ]}
      nav={{ title: BrandNavigation }}
      sidebar={{ footer: SidebarFooter }}
      themeSwitch={{ enabled: false }}
      tree={source.getPageTree()}
    >
      {children}
    </DocsLayout>
  );
}
