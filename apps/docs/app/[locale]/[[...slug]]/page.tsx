import {
  DocsBody,
  DocsPage,
  MarkdownCopyButton,
} from "fumadocs-ui/layouts/notebook/page";
import mdxComponents from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { docsCopy, onThisPage } from "../../../lib/i18n";
import { defaultLocale, isLocale } from "../../../lib/locale";
import {
  markdownUrl,
  pageAlternates,
  pageLanguage,
  source,
} from "../../../lib/source";

type PageProps = {
  params: Promise<{ locale: string; slug?: string[] }>;
};

export function generateStaticParams() {
  return source.generateParams("slug", "locale");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = source.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  const languages = pageAlternates(page.slugs);
  const canonical = languages[locale] ?? languages[defaultLocale] ?? page.url;

  return {
    title: slug?.length ? page.data.title : { absolute: page.data.title },
    description: page.data.description,
    alternates: {
      canonical,
      languages,
      types: { "text/markdown": markdownUrl(page.url) },
    },
    openGraph: {
      type: "website",
      siteName: "Lunaris Docs",
      url: canonical,
      title: page.data.title,
      description: page.data.description,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const page = source.getPage(slug, locale);

  if (!page) {
    notFound();
  }

  const { body: Content, toc } = page.data;
  const isOverview = page.slugs.length === 0;
  const contentLocale = pageLanguage(page);
  const isFallback = contentLocale !== locale;
  const sections = toc.filter((item) => item.depth > 1);

  return (
    <DocsPage
      breadcrumb={{ enabled: !isOverview }}
      footer={{ enabled: !isOverview }}
      tableOfContent={{ enabled: !isOverview && sections.length > 0 }}
      tableOfContentPopover={{
        enabled: !isOverview && sections.length > 0,
        trigger: {
          "aria-label": onThisPage(locale),
          className:
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring",
        },
      }}
      toc={sections}
    >
      {isFallback && (
        <p className="rounded-lg border bg-fd-muted px-4 py-3 text-fd-muted-foreground text-sm">
          {docsCopy[locale].fallback}
        </p>
      )}
      <DocsBody
        className={isOverview ? "docs-overview" : undefined}
        lang={isFallback ? contentLocale : undefined}
      >
        <Content
          components={{
            ...mdxComponents,
            a: ({ href, ...props }) => {
              if (!href?.startsWith("/") || locale === defaultLocale) {
                return <mdxComponents.a href={href} {...props} />;
              }
              const [path] = href.split(/[?#]/, 1);
              const english = source.getPageByUrl(path, defaultLocale);
              const localized =
                english && source.getPage(english.slugs, locale);
              return (
                <mdxComponents.a
                  href={
                    localized ? localized.url + href.slice(path.length) : href
                  }
                  {...props}
                />
              );
            },
          }}
        />
      </DocsBody>
      {!isOverview && (
        <div>
          <MarkdownCopyButton markdownUrl={markdownUrl(page.url)} />
        </div>
      )}
    </DocsPage>
  );
}
