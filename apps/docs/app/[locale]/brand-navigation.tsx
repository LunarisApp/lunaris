"use client";

import { useI18n } from "fumadocs-ui/contexts/i18n";
import Image from "next/image";
import Link from "next/link";
import markOnDark from "../../../../assets/brand/source/mark-on-dark.svg";
import markOnLight from "../../../../assets/brand/source/mark-on-light.svg";
import { docsCopy } from "../../lib/i18n";
import { defaultLocale, isLocale, localePath } from "../../lib/locale";

export function BrandNavigation({ className }: { className?: string }) {
  const { locale: currentLocale } = useI18n();
  const locale = isLocale(currentLocale) ? currentLocale : defaultLocale;
  const home = localePath(locale, "/");

  return (
    <span className={className}>
      <span className="docs-brand">
        <a href={`https://lunaris.app${home}`}>
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
          Lunaris
        </a>
        <Link href={home}>{docsCopy[locale].docs}</Link>
      </span>
    </span>
  );
}
