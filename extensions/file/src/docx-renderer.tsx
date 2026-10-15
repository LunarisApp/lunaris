import { DocxViewerPreview } from "./components/extend/docx-viewer";

interface DocxRendererProps {
  filename: string;
  objectUrl: string;
}

export function DocxRenderer({ filename, objectUrl }: DocxRendererProps) {
  return (
    <DocxViewerPreview
      className="h-full"
      fileName={filename}
      isDark={false}
      onIsDarkChange={() => undefined}
      showFileActionsMenu={false}
      showUpload={false}
      src={objectUrl}
    />
  );
}
