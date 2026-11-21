import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale, stripLocalePrefix } from "./lib/locale";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const [, prefix] = url.pathname.split("/");

  if (prefix === defaultLocale) {
    url.pathname = stripLocalePrefix(url.pathname, defaultLocale);
    return NextResponse.redirect(url, 308);
  }

  if (!isLocale(prefix)) {
    url.pathname = `/${defaultLocale}${url.pathname}`;
    return NextResponse.rewrite(url);
  }
}

export const config = {
  matcher: ["/((?!api(?:/|$)|health(?:/|$)|_next(?:/|$)|.*\\..*).*)"],
};
