import { createContext, useContext } from "react";

// Resource renderers keep their own data context while placing mobile chrome
// in the route's single navigation bar.
export const MobileResourceHeaderContext = createContext<{
  actions: HTMLDivElement | null;
  metadata: HTMLDivElement | null;
} | null>(null);

export function useMobileResourceHeader() {
  return useContext(MobileResourceHeaderContext);
}
