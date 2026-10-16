import { PanelError } from "@lunarisapp/ui/components/panel-error";

interface UnsupportedRendererProps {
  mediaType: string;
}

export function UnsupportedRenderer({ mediaType }: UnsupportedRendererProps) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <PanelError
        description={mediaType}
        title="Unsupported file"
        variant="error"
      />
    </div>
  );
}
