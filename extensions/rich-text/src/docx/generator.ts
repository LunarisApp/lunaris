import { COLORS_DEFAULT, type TableCellProps } from "@blocknote/core";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
} from "docx";
import type {
  RichTextBlock,
  RichTextInline,
  RichTextTable,
} from "../blocknote-types";
import { loadDocxImage } from "./images";

interface DocxLabels {
  missingImage: string;
}
export interface DocxResult {
  blob: Blob;
  missingImages: number;
}
type Props = Readonly<Record<string, unknown>>;
type InlineRun = TextRun | ExternalHyperlink;
const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

function color(
  value: unknown,
  kind: "text" | "background",
): string | undefined {
  if (typeof value !== "string" || value === "default") return undefined;
  const hex = COLORS_DEFAULT[value]?.[kind] ?? value;
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.slice(1);
  if (/^#[0-9a-f]{3}$/i.test(hex))
    return hex
      .slice(1)
      .split("")
      .map((digit) => digit + digit)
      .join("");
  return undefined;
}

function runStyle(props: Props): IRunOptions {
  const fill = color(props.backgroundColor, "background");
  return {
    bold: typeof props.bold === "boolean" ? props.bold : undefined,
    italics: typeof props.italic === "boolean" ? props.italic : undefined,
    strike: typeof props.strike === "boolean" ? props.strike : undefined,
    underline: props.underline === true ? {} : undefined,
    font: props.code === true ? "Courier New" : undefined,
    color: color(props.textColor, "text"),
    shading: fill ? { fill } : undefined,
  };
}

function textRuns(text: string, props: Props): TextRun[] {
  return text.split(/\r\n|\r|\n/).map(
    (line, index) =>
      new TextRun({
        ...runStyle(props),
        text: line,
        break: index ? 1 : undefined,
      }),
  );
}

function inline(
  content: readonly RichTextInline[],
  inherited: Props = {},
): InlineRun[] {
  return content.flatMap((item): InlineRun[] => {
    if (item.type === "entityReference")
      return textRuns(`@${item.props.name}`, inherited);
    if (item.type === "link") {
      const children = item.content.flatMap((child) =>
        textRuns(child.text, { ...inherited, ...child.styles }),
      );
      return [new ExternalHyperlink({ link: item.href, children })];
    }
    return textRuns(item.text, { ...inherited, ...item.styles });
  });
}

function paragraphProps(props: Props): IParagraphOptions {
  const fill = color(props.backgroundColor, "background");
  return {
    alignment:
      props.textAlignment === "center"
        ? AlignmentType.CENTER
        : props.textAlignment === "right"
          ? AlignmentType.RIGHT
          : props.textAlignment === "justify"
            ? AlignmentType.JUSTIFIED
            : AlignmentType.LEFT,
    shading: fill ? { fill } : undefined,
  };
}

function table(content: RichTextTable): Table | Paragraph {
  if (!content.rows.length || !content.rows.some((row) => row.cells.length))
    return new Paragraph("");
  // End row (exclusive) for columns occupied by vertically merged cells.
  const occupiedUntil: number[] = [];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: content.rows.map((row, rowIndex) => {
      let column = 0;
      return new TableRow({
        tableHeader: rowIndex < (content.headerRows ?? 0),
        children: row.cells.map((cell) => {
          const props: Partial<TableCellProps> = Array.isArray(cell)
            ? {}
            : cell.props;
          const values = Array.isArray(cell) ? cell : cell.content;
          while ((occupiedUntil[column] ?? 0) > rowIndex) column += 1;
          const header =
            rowIndex < (content.headerRows ?? 0) ||
            column < (content.headerCols ?? 0);
          const span = props.colspan ?? 1;
          for (let offset = 0; offset < span; offset += 1) {
            occupiedUntil[column + offset] = rowIndex + (props.rowspan ?? 1);
          }
          column += span;
          const fill = color(props.backgroundColor, "background");
          return new TableCell({
            columnSpan: props.colspan,
            rowSpan: props.rowspan,
            shading: fill ? { fill } : undefined,
            children: [
              new Paragraph({
                ...paragraphProps(props),
                children: inline(values, { ...props, bold: header }),
              }),
            ],
          });
        }),
      });
    }),
  });
}

export async function generateDocx(
  blocks: readonly RichTextBlock[],
  title: string,
  labels: DocxLabels,
): Promise<DocxResult> {
  const numbering: { reference: string; levels: ILevelsOptions[] }[] = [];
  let missingImages = 0;

  async function render(
    siblings: readonly RichTextBlock[],
    depth = 0,
  ): Promise<(Paragraph | Table)[]> {
    const output: (Paragraph | Table)[] = [];
    let numberedReference: string | undefined;
    for (const block of siblings) {
      const props: Props = block.props;
      const content = Array.isArray(block.content) ? block.content : [];
      const options = paragraphProps(props);
      const level = Math.min(depth, 8);
      if (block.type !== "numberedListItem") numberedReference = undefined;
      if (block.type === "table") {
        output.push(table(block.content));
      } else if (block.type === "image") {
        const name =
          block.props.name || block.props.caption || labels.missingImage;
        try {
          if (!block.props.url) throw new Error("Image URL missing");
          const image = await loadDocxImage(
            block.props.url,
            block.props.previewWidth,
          );
          output.push(
            new Paragraph({
              ...options,
              children: [
                new ImageRun({
                  ...image,
                  altText: {
                    name,
                    title: name,
                    description: block.props.caption || name,
                  },
                }),
              ],
            }),
          );
        } catch {
          missingImages += 1;
          output.push(
            new Paragraph({
              ...options,
              children: textRuns(`${labels.missingImage}: ${name}`, {}),
            }),
          );
        }
        if (block.props.caption)
          output.push(
            new Paragraph({
              children: textRuns(block.props.caption, { italic: true }),
            }),
          );
      } else if (
        block.type === "numberedListItem" ||
        block.type === "bulletListItem" ||
        block.type === "checkListItem"
      ) {
        if (block.type === "numberedListItem") {
          const start =
            typeof props.start === "number" &&
            Number.isInteger(props.start) &&
            props.start > 0
              ? props.start
              : undefined;
          if (!numberedReference || start !== undefined) {
            numberedReference = `list-${numbering.length}`;
            numbering.push({
              reference: numberedReference,
              levels: Array.from({ length: 9 }, (_, index) => ({
                level: index,
                format: LevelFormat.DECIMAL,
                text: `%${index + 1}.`,
                start: index === level ? (start ?? 1) : 1,
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: 360 * (index + 1), hanging: 260 },
                  },
                },
              })),
            });
          }
        }
        output.push(
          new Paragraph({
            ...options,
            numbering: numberedReference
              ? { reference: numberedReference, level }
              : undefined,
            bullet: block.type === "bulletListItem" ? { level } : undefined,
            indent:
              block.type === "checkListItem"
                ? { left: 360 * (level + 1), hanging: 260 }
                : undefined,
            children: [
              ...(block.type === "checkListItem"
                ? textRuns(`${block.props.checked ? "☑" : "☐"} `, {})
                : []),
              ...inline(content, props),
            ],
          }),
        );
      } else if (block.type === "heading") {
        output.push(
          new Paragraph({
            ...options,
            heading: HEADINGS[block.props.level - 1] ?? HeadingLevel.HEADING_1,
            children: inline(content, props),
          }),
        );
      } else if (block.type === "codeBlock") {
        output.push(
          new Paragraph({
            ...options,
            children: inline(content, { ...props, code: true }),
          }),
        );
      } else if (typeof props.url === "string" && props.url) {
        const name =
          typeof props.name === "string" && props.name
            ? props.name
            : block.type;
        output.push(
          new Paragraph({
            ...options,
            children: [
              new ExternalHyperlink({
                link: props.url,
                children: textRuns(name, {}),
              }),
            ],
          }),
        );
        if (typeof props.caption === "string" && props.caption)
          output.push(new Paragraph(props.caption));
      } else {
        output.push(
          new Paragraph({
            ...options,
            indent: depth ? { left: depth * 360 } : undefined,
            children: inline(content, props),
          }),
        );
      }
      output.push(...(await render(block.children, depth + 1)));
    }
    return output;
  }

  const children = await render(blocks);
  const document = new Document({
    title,
    numbering: { config: numbering },
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          },
        },
        children: children.length ? children : [new Paragraph("")],
      },
    ],
  });
  return { blob: await Packer.toBlob(document), missingImages };
}
