import { XlsxViewerPreview } from "./components/extend/xlsx-viewer";
import { useExtendViewerTheme } from "./extend-viewer-theme";

interface XlsxRendererProps {
  filename: string;
  objectUrl: string;
}

export function XlsxRenderer({ filename, objectUrl }: XlsxRendererProps) {
  const { isDark, setIsDark } = useExtendViewerTheme();

  return (
    <XlsxViewerPreview
      className="h-full"
      fileName={filename}
      isDark={isDark}
      onIsDarkChange={setIsDark}
      showUpload={false}
      src={objectUrl}
    />
  );
}
