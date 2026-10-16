import { PanelError } from "@lunarisapp/ui/components/panel-error";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import XMLViewer from "react-xml-viewer";

const XML_VIEWER_DARK_THEME = {
  attributeKeyColor: "#38bdf8",
  attributeValueColor: "#22c55e",
  cdataColor: "#a78bfa",
  commentColor: "#94a3b8",
  separatorColor: "#94a3b8",
  tagColor: "#fb923c",
  textColor: "#e5e7eb",
};

const XML_VIEWER_LIGHT_THEME = {
  attributeKeyColor: "#0369a1",
  attributeValueColor: "#15803d",
  cdataColor: "#7c3aed",
  commentColor: "#64748b",
  separatorColor: "#475569",
  tagColor: "#c2410c",
  textColor: "#111827",
};

export function XmlRenderer({ text }: { text: string }) {
  const { t } = useTranslation();
  const { resolvedTheme, theme } = useTheme();
  const xmlTheme =
    (resolvedTheme ?? theme) === "dark"
      ? XML_VIEWER_DARK_THEME
      : XML_VIEWER_LIGHT_THEME;

  return (
    <div
      className="h-full overflow-auto bg-background p-4"
      data-testid="xml-renderer"
    >
      <XMLViewer
        indentSize={2}
        invalidXml={
          <PanelError
            title={t("fileExtension.file.invalidXml")}
            variant="error"
          />
        }
        theme={xmlTheme}
        xml={text}
      />
    </div>
  );
}
