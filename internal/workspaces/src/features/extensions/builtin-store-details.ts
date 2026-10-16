import type { ExtensionMarketplaceEntry } from "@lunarisapp/plugin-sdk/marketplace";

export type ExtensionStoreDetails = Pick<
  ExtensionMarketplaceEntry,
  "longDescription" | "screenshots"
>;

export const BUILTIN_EXTENSION_ICON_URLS: Readonly<
  Partial<Record<string, string>>
> = {
  "lunaris.file": new URL("./assets/builtin-file.webp", import.meta.url).href,
  "lunaris.kanban": new URL("./assets/builtin-kanban.webp", import.meta.url)
    .href,
  "lunaris.rich-text": new URL(
    "./assets/builtin-rich-text.webp",
    import.meta.url
  ).href,
};

export const BUILTIN_EXTENSION_STORE_DETAILS: Readonly<
  Partial<Record<string, ExtensionStoreDetails>>
> = {
  "lunaris.file": {
    screenshots: [
      {
        alt: "Word document preview open in Lunaris",
        url: new URL("./assets/file.png", import.meta.url).href,
      },
    ],
  },
  "lunaris.kanban": {
    screenshots: [
      {
        alt: "Kanban board organized by status columns in Lunaris",
        url: new URL("./assets/kanban.png", import.meta.url).href,
      },
    ],
  },
  "lunaris.rich-text": {
    screenshots: [
      {
        alt: "Rich text document with formatting menu open in Lunaris",
        url: new URL("./assets/rich-text.png", import.meta.url).href,
      },
    ],
  },
};
