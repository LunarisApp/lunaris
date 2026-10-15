import { PDFViewer } from "./components/extend/pdf-viewer";

interface PdfRendererProps {
  filename: string;
  objectUrl: string;
}

export function PdfRenderer({ filename, objectUrl }: PdfRendererProps) {
  return (
    <PDFViewer
      className="h-full"
      fileName={filename}
      showUpload={false}
      src={objectUrl}
    />
  );
}
