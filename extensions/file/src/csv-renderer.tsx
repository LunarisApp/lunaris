import { CsvViewer } from "./components/extend/csv-viewer";

interface CsvRendererProps {
  filename: string;
  text: string;
}

export function CsvRenderer({ filename, text }: CsvRendererProps) {
  return (
    <section
      aria-label={filename}
      className="h-full"
      data-testid="csv-renderer"
    >
      <CsvViewer
        className="h-full"
        data={text}
        fileName={filename}
        search
        showUpload={false}
      />
    </section>
  );
}
