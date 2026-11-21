import {
  defaultLocale,
  isLocale,
  localePath,
  locales,
} from "../../../lib/locale";
import { docsLlms } from "../../../lib/source";

export const dynamic = "force-static";
export const dynamicParams = false;

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function generateStaticParams() {
  const files = await Promise.all(
    locales.map(async (locale) =>
      (await docsLlms.files(locale)).map((file) =>
        rootIndex(file) ? localePath(locale, file) : file
      )
    )
  );
  return files
    .flat()
    .map((file) => ({ path: decodeURI(file).slice(1).split("/") }));
}

function rootIndex(path: string) {
  return path === "/llms.txt" || path === "/llms-full.txt";
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { path } = await params;
  const [prefix, ...rest] = path;
  const homepage =
    path.length === 1 && prefix.endsWith(".md")
      ? prefix.slice(0, -3)
      : undefined;
  const locale = isLocale(prefix)
    ? prefix
    : isLocale(homepage)
      ? homepage
      : defaultLocale;
  const pathname = `/${path.join("/")}`;
  const withoutLocale = `/${rest.join("/")}`;
  const file =
    isLocale(prefix) && rootIndex(withoutLocale) ? withoutLocale : pathname;
  return (
    (await docsLlms.serve(file, locale)) ?? new Response(null, { status: 404 })
  );
}
