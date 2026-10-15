import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useExtendViewerTheme() {
  const { resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState(resolvedTheme === "dark");

  useEffect(() => {
    setIsDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  return { isDark, setIsDark };
}
