"use client";

import Image from "next/image";
import Link from "next/link";
import markOnDark from "../../../../assets/brand/source/mark-on-dark.svg";
import markOnLight from "../../../../assets/brand/source/mark-on-light.svg";

export function BrandNavigation({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="docs-brand">
        <a href="https://lunaris.app/">
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
        <Link href="/">Docs</Link>
      </span>
    </span>
  );
}
