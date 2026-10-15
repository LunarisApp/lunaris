import { type Auth, createAuth } from "@repo/auth/server";
import { drizzle } from "drizzle-orm/node-postgres";

// This is a fake auth instance for migrations inference.
// Don't use this directly.
const db = drizzle("");
export const auth: Auth = createAuth(db, {
  backendUrl: "http://localhost:3000",
  polarConfig: {
    accessToken: "",
    webhookSecret: "",
  },
  // Keep existing team tables in schema inference for both editions.
  organizationTeams: { enabled: true },
  frontendUrl: "http://localhost:5173",
});
