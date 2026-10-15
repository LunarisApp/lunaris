import type { createWorkspaceSchema } from "@repo/data/features/workspaces";
import type * as z from "zod";

export type CreateWorkspaceDialogSchema = z.infer<typeof createWorkspaceSchema>;
