import type { ReactNode } from "react";
import { useEffect, useState } from "react";

interface DelayedLoadingProps {
  children: ReactNode;
  delayMs?: number;
}

const DEFAULT_DELAY_MS = 250;

export function DelayedLoading({
  children,
  delayMs = DEFAULT_DELAY_MS,
}: DelayedLoadingProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return visible ? children : null;
}
