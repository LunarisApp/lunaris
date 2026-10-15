"use client";

import type { AuthClient } from "@repo/auth/client";
import { createContext, useContext } from "react";

const AuthContext = createContext<AuthClient | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
  client: AuthClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  return <AuthContext value={client}>{children}</AuthContext>;
}

export function useAuth(): AuthClient {
  const client = useContext(AuthContext);
  if (!client) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return client;
}
