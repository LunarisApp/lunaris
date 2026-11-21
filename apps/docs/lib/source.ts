import { llms, loader } from "fumadocs-core/source";
import { docs } from "../.source/server";
import { docsCopy, i18n } from "./i18n";
import { defaultLocale, isLocale, localePath, locales } from "./locale";
import { siteUrl } from "./site";

export const source = loader({
  baseUrl: "/",
  i18n,
  source: docs.toFumadocsSource(),
  pageTree: {
    transformers: [
      {
        file(node) {
          const locale = isLocale(this.locale) ? this.locale : defaultLocale;
          return node.url === localePath(locale, "/")
            ? { ...node, name: docsCopy[locale].overview }
            : node;
        },
        folder(node, path) {
          return this.locale !== defaultLocale &&
            !path.includes("/") &&
            node.index
            ? { ...node, name: node.index.name }
            : node;
        },
        separator(node) {
          if (!isLocale(this.locale) || typeof node.name !== "string") {
            return node;
          }
          const labels: Record<string, string> =
            docsCopy[this.locale].separators;
          const name = labels[node.name];
          return name ? { ...node, name } : node;
        },
      },
    ],
  },
});

export function pageLanguage(page: typeof source.$inferPage) {
  return page.data.info.path ===
    source.getPage(page.slugs, defaultLocale)?.data.info.path
    ? defaultLocale
    : page.locale;
}

export function pageAlternates(slugs: string[]) {
  const languages: Record<string, string> = {};
  for (const locale of locales) {
    const page = source.getPage(slugs, locale);
    if (page && pageLanguage(page) === locale) {
      languages[locale] = new URL(page.url, siteUrl).href;
    }
  }
  if (languages[defaultLocale]) {
    languages["x-default"] = languages[defaultLocale];
  }
  return languages;
}

export const docsLlms = llms(source, {
  renderName: (item, { lang }) => {
    const name = typeof item.name === "string" ? item.name : "";
    if (item.type === "page") {
      return source.getNodePage(item, lang)?.data.title ?? name;
    }
    if (item.type === "root" && lang !== defaultLocale) {
      return source.getPage([], lang)?.data.title ?? name;
    }
    return name;
  },
  renderDescription: (item, { lang }) => {
    const description =
      typeof item.description === "string" ? item.description : "";
    if (item.type === "page") {
      return source.getNodePage(item, lang)?.data.description ?? description;
    }
    if (item.type === "root" && lang !== defaultLocale) {
      return source.getPage([], lang)?.data.description ?? description;
    }
    return description;
  },
  renderPage: (page) => page.data.getText("processed"),
  renderUrl: (item) => new URL(item.url, siteUrl).href,
  section: (folder) => folder.index !== undefined,
});

export function markdownUrl(pageUrl: string) {
  return pageUrl === "/" ? "/index.md" : `${pageUrl}.md`;
}
