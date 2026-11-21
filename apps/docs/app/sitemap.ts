import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";
import { pageAlternates, pageLanguage, source } from "../lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return source
    .getPages()
    .filter((page) => pageLanguage(page) === page.locale)
    .map(({ url, slugs }) => ({
      url: new URL(url, siteUrl).href,
      alternates: { languages: pageAlternates(slugs) },
    }));
}
