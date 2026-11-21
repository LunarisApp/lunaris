import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { source } from "../../lib/source";
import { BrandNavigation } from "./brand-navigation";
import { SidebarFooter } from "./sidebar-footer";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      links={[{ text: "Log in / Sign up", url: "https://web.lunaris.app" }]}
      nav={{ title: BrandNavigation }}
      sidebar={{ footer: SidebarFooter }}
      themeSwitch={{ enabled: false }}
      tree={source.getPageTree()}
    >
      {children}
    </DocsLayout>
  );
}
