import {
  DocsBody,
  DocsPage,
  MarkdownCopyButton,
} from "fumadocs-ui/layouts/notebook/page";
import mdxComponents from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { source } from "../../../lib/source";

type PageProps = {
  params: Promise<{ slug?: string[] }>;
};

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) {
    notFound();
  }

  return {
    title: slug?.length ? page.data.title : { absolute: page.data.title },
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: {
      type: "website",
      siteName: "Lunaris Docs",
      url: page.url,
      title: page.data.title,
      description: page.data.description,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);

  if (!page) {
    notFound();
  }

  const { body: Content, toc } = page.data;
  const isOverview = page.slugs.length === 0;
  const sections = toc.filter((item) => item.depth > 1);

  return (
    <DocsPage
      breadcrumb={{ enabled: !isOverview }}
      footer={{ enabled: !isOverview }}
      tableOfContent={{ enabled: !isOverview && sections.length > 0 }}
      tableOfContentPopover={{
        enabled: !isOverview && sections.length > 0,
        trigger: {
          "aria-label": "On this page",
          className:
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fd-ring",
        },
      }}
      toc={sections}
    >
      <DocsBody className={isOverview ? "docs-overview" : undefined}>
        <Content components={mdxComponents} />
      </DocsBody>
      {!isOverview && (
        <div>
          <MarkdownCopyButton markdownUrl={`/api/markdown${page.url}`} />
        </div>
      )}
    </DocsPage>
  );
}
