"use client";

import type { ApiClient } from "@repo/data/http";
import { createContext, useContext } from "react";

const ApiContext = createContext<ApiClient | null>(null);

interface ApiProviderProps {
  children: React.ReactNode;
  client: ApiClient;
}

export function ApiProvider({ children, client }: ApiProviderProps) {
  return <ApiContext value={client}>{children}</ApiContext>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) {
    throw new Error("useApi must be used within an ApiProvider");
  }
  return client;
}
