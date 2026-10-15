import { PptxViewerPreview } from "./components/extend/pptx-viewer";

interface PptxRendererProps {
  filename: string;
  objectUrl: string;
}

export function PptxRenderer({ filename, objectUrl }: PptxRendererProps) {
  return (
    <PptxViewerPreview
      className="h-full"
      fileName={filename}
      showUpload={false}
      src={objectUrl}
    />
  );
}
