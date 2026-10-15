import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { LoadedTextRendererProps } from "./text-renderer-utils";

export function MarkdownRenderer({ filename, text }: LoadedTextRendererProps) {
  return (
    <div
      aria-label={filename}
      className="h-full overflow-auto bg-background p-6 text-foreground text-sm leading-7 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_h1]:mb-4 [&_h1]:font-semibold [&_h1]:text-2xl [&_h2]:mb-3 [&_h2]:font-semibold [&_h2]:text-xl [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-lg [&_hr]:my-6 [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
      data-testid="markdown-renderer"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
