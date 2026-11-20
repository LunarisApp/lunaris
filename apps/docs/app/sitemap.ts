import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site";
import { source } from "../lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map(({ url }) => ({
    url: new URL(url, siteUrl).href,
  }));
}
