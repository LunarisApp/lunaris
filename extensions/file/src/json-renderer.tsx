import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { lightTheme } from "@uiw/react-json-view/light";
import { useTheme } from "next-themes";
import {
  type LoadedTextRendererProps,
  PlainTextRenderer,
  toJsonViewValue,
} from "./text-renderer-utils";

export function JsonRenderer({ filename, text }: LoadedTextRendererProps) {
  const { resolvedTheme, theme } = useTheme();
  const themeStyles = (resolvedTheme ?? theme) === "dark" ? darkTheme : lightTheme;
  const jsonThemeStyles = {
    ...themeStyles,
    "--w-rjv-background-color": "transparent",
    backgroundColor: "transparent",
  };

  try {
    const value = toJsonViewValue(JSON.parse(text) as unknown);
    return (
      <div className="h-full overflow-auto p-4" data-testid="json-renderer">
        <JsonView
          collapsed={false}
          displayDataTypes={false}
          enableClipboard={true}
          style={jsonThemeStyles}
          value={value}
        />
      </div>
    );
  } catch {
    return <PlainTextRenderer filename={filename} text={text} />;
  }
}
