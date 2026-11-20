import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import Image from "next/image";
import type { ReactNode } from "react";
import markOnDark from "../../../../assets/brand/source/mark-on-dark.svg";
import markOnLight from "../../../../assets/brand/source/mark-on-light.svg";
import { source } from "../../lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      links={[{ text: "Open Lunaris", url: "https://web.lunaris.app" }]}
      nav={{
        mode: "top",
        title: (
          <span className="docs-brand">
            <Image
              alt=""
              className="dark:hidden"
              height={22}
              src={markOnLight}
              width={22}
            />
            <Image
              alt=""
              className="hidden dark:block"
              height={22}
              src={markOnDark}
              width={22}
            />
            Lunaris <span>Docs</span>
          </span>
        ),
        url: "/",
      }}
      tree={source.getPageTree()}
    >
      {children}
    </DocsLayout>
  );
}
