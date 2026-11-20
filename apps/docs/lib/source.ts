import { llms, loader } from "fumadocs-core/source";
import { docs } from "../.source/server";
import { siteUrl } from "./site";

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

export const docsLlms = llms(source, {
  renderPage: (page) => page.data.getText("processed"),
  renderUrl: (item) => new URL(item.url, siteUrl).href,
  section: (folder) => folder.index !== undefined,
});

export function markdownUrl(pageUrl: string) {
  return pageUrl === "/" ? "/index.md" : `${pageUrl}.md`;
}
