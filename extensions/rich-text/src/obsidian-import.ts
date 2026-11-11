import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment } from "@blocknote/core/yjs";
import type { JsonObject } from "@lunarisapp/plugin-sdk";
import type { Root, RootContent, PhrasingContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { parseDocument } from "yaml";
import type { Doc } from "yjs";
import {
  ENTITY_REFERENCE_TYPE,
  richTextHeadlessSchema,
} from "./entity-reference-schema";

export type ImportWarning =
  | "frontmatter"
  | "unresolved-link"
  | "ambiguous-link"
  | "anchor"
  | "transclusion"
  | "unsupported-syntax"
  | "conversion";
export interface ImportedReference {
  image?: boolean;
  name: string;
  resourceId: string;
  storageId?: string;
  workspaceId: string;
}
export type ResolveImportReference = (
  target: string,
  wiki: boolean
) => { reference?: ImportedReference; warning?: ImportWarning };

function stringList(value: unknown): string[] {
  return (
    Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  ).filter((entry): entry is string => typeof entry === "string");
}

export function readObsidianProperties(source: string) {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  let properties: JsonObject = {};
  let warning: ImportWarning | undefined;
  if (match) {
    try {
      const parsed = parseDocument(match[1]!, { uniqueKeys: true });
      if (parsed.errors.length) {
        throw new Error("Invalid frontmatter");
      }
      const value: unknown = parsed.toJS({ maxAliasCount: 100 });
      if (
        value !== null &&
        (typeof value !== "object" || Array.isArray(value))
      ) {
        throw new Error("Expected properties");
      }
      // Strip YAML-specific objects; storage accepts JSON only.
      properties = JSON.parse(JSON.stringify(value ?? {}));
    } catch {
      warning = "frontmatter";
    }
  }
  return {
    properties,
    aliases: stringList(properties.aliases ?? properties.alias),
    tags: stringList(properties.tags ?? properties.tag)
      .flatMap((tag) => tag.split(/[\s,]+/))
      .filter(Boolean),
    frontmatter: match?.[1] ?? "",
    body: match ? source.slice(match[0].length) : source,
    warning,
  };
}

const markdown = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

function linkLabel(node: PhrasingContent): string {
  if ("children" in node) {
    return node.children.map(linkLabel).join("");
  }
  if ("value" in node) {
    return node.value;
  }
  return "alt" in node ? (node.alt ?? "") : "";
}

/** A converter is reused for an entire vault, then explicitly destroyed. */
export function createObsidianMarkdownConverter() {
  const editor = BlockNoteEditor.create({ schema: richTextHeadlessSchema });
  return {
    destroy: () => editor._tiptapEditor?.destroy(),
    convert(source: string, resolve: ResolveImportReference) {
      const metadata = readObsidianProperties(source);
      const warnings = new Set<ImportWarning>();
      if (metadata.warning) {
        warnings.add(metadata.warning);
      }
      const tree = markdown.parse(metadata.body) as Root;
      const marker = `https://lunaris-import.invalid/${crypto.randomUUID()}/`;
      const references = new Map<
        string,
        {
          type: typeof ENTITY_REFERENCE_TYPE;
          props: {
            resourceId: string;
            workspaceId: string;
            name: string;
            kind: "resource";
            embed: boolean;
            storageId: string;
            width: number;
          };
        }
      >();
      const definitions = new Map<
        string,
        Extract<RootContent, { type: "definition" }>
      >();
      function collect(node: Root | RootContent) {
        if (node.type === "definition") {
          definitions.set(node.identifier.toLowerCase(), node);
        }
        if ("children" in node) {
          for (const child of node.children) {
            collect(child as RootContent);
          }
        }
      }
      collect(tree);
      function referenceLink(
        target: string,
        label: string,
        embed: boolean,
        wiki: boolean
      ): PhrasingContent | null {
        if (EXTERNAL_URL.test(target)) {
          return null;
        }
        const result = resolve(target, wiki);
        if (result.warning) {
          warnings.add(result.warning);
        }
        if (!result.reference) {
          warnings.add(result.warning ?? "unresolved-link");
          return null;
        }
        const reference = result.reference;
        if (/[#?]/.test(target)) {
          warnings.add("anchor");
        }
        if (embed && !reference.image) {
          warnings.add("transclusion");
        }
        const size = embed && /^(\d+)(?:x\d+)?$/.exec(label);
        const name = size ? reference.name : label || reference.name;
        const url = `${marker}${references.size}`;
        references.set(url, {
          type: ENTITY_REFERENCE_TYPE,
          props: {
            resourceId: reference.resourceId,
            workspaceId: reference.workspaceId,
            name,
            kind: "resource",
            embed: embed && !!reference.image,
            storageId: reference.storageId ?? "",
            width: size ? Math.min(1600, Math.max(1, Number(size[1]))) : 0,
          },
        });
        return { type: "link", url, children: [{ type: "text", value: name }] };
      }
      function visit(node: Root | RootContent): void {
        if (
          node.type === "footnoteReference" ||
          node.type === "footnoteDefinition"
        ) {
          warnings.add("unsupported-syntax");
        }
        if (node.type === "code") {
          if (/^(dataview|dataviewjs|query|mermaid)$/.test(node.lang ?? "")) {
            warnings.add("unsupported-syntax");
          }
          return;
        }
        if (node.type === "html") {
          warnings.add("unsupported-syntax");
        }
        if (!("children" in node)) {
          return;
        }
        const children: RootContent[] = [];
        for (const child of node.children) {
          // Reference nodes are expanded before BlockNote's inline-only parser.
          if (child.type === "definition") {
            continue;
          }
          if (child.type === "text") {
            if (/\[![\w-]+\]|%%|==|\$|(?:^|\s)\^[\w-]+/.test(child.value)) {
              warnings.add("unsupported-syntax");
            }
            let offset = 0;
            for (const match of child.value.matchAll(
              /(!?)\[\[([^\]\n]+)\]\]/g
            )) {
              const [target, ...alias] = match[2]!.split("|");
              const replacement = referenceLink(
                target!,
                alias.join("|") || target!,
                match[1] === "!",
                true
              );
              if (!replacement) {
                continue;
              }
              if (match.index > offset) {
                children.push({
                  type: "text",
                  value: child.value.slice(offset, match.index),
                });
              }
              children.push(replacement);
              offset = match.index + match[0].length;
            }
            children.push({ type: "text", value: child.value.slice(offset) });
          } else if (
            child.type === "link" ||
            child.type === "image" ||
            child.type === "linkReference" ||
            child.type === "imageReference"
          ) {
            const definition =
              "identifier" in child
                ? definitions.get(child.identifier.toLowerCase())
                : undefined;
            const url = "url" in child ? child.url : definition?.url;
            const embed =
              child.type === "image" || child.type === "imageReference";
            const label =
              "children" in child
                ? child.children.map(linkLabel).join("")
                : (child.alt ?? "");
            const reference = url && referenceLink(url, label, embed, false);
            if (reference) {
              children.push(reference);
            } else if (definition && child.type === "linkReference") {
              children.push({
                type: "link",
                url: definition.url,
                title: definition.title,
                children: child.children,
              });
            } else if (definition && child.type === "imageReference") {
              children.push({
                type: "image",
                url: definition.url,
                title: definition.title,
                alt: child.alt,
              });
            } else {
              children.push(child);
            }
          } else if (child.type === "html") {
            warnings.add("unsupported-syntax");
            children.push(
              node.type === "root" ||
                node.type === "blockquote" ||
                node.type === "listItem"
                ? { type: "code", lang: "html", value: child.value }
                : { type: "inlineCode", value: child.value }
            );
          } else {
            visit(child as RootContent);
            children.push(child as RootContent);
          }
        }
        // Traversal preserves each parent's legal Markdown child kinds.
        node.children = children as typeof node.children;
      }
      visit(tree);
      let blocks: typeof editor.document;
      try {
        blocks = editor.tryParseMarkdownToBlocks(markdown.stringify(tree));
        // Table cells and nested list blocks also contain inline links.
        function replace(value: unknown): unknown {
          if (Array.isArray(value)) {
            return value.map(replace);
          }
          if (value && typeof value === "object") {
            const object = value as Record<string, unknown>;
            if (
              object.type === "link" &&
              typeof object.href === "string" &&
              references.has(object.href)
            ) {
              return references.get(object.href);
            }
            return Object.fromEntries(
              Object.entries(object).map(([key, child]) => [
                key,
                replace(child),
              ])
            );
          }
          return value;
        }
        blocks = replace(blocks) as typeof blocks;
        if (metadata.warning) {
          blocks.unshift(
            ...editor.tryParseMarkdownToBlocks(
              `\`\`\`yaml\n${metadata.frontmatter}\n\`\`\``
            )
          );
        }
      } catch {
        warnings.add("conversion");
        blocks = editor.tryParseMarkdownToBlocks("");
        blocks = [
          {
            ...blocks[0]!,
            type: "codeBlock",
            props: { language: "markdown" },
            content: [{ type: "text", text: source, styles: {} }],
            children: [],
          },
        ];
      }
      return {
        metadata,
        warnings: [...warnings],
        initialize(doc: Doc) {
          blocksToYXmlFragment(editor, blocks, doc.getXmlFragment());
        },
      };
    },
  };
}
