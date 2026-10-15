import type { infer as Infer } from "zod";
import { z } from "zod";
import { paginationQuerySchema } from "@app/utils/pagination";

const reservedStorageKeyShape = {
  constructor: z.never().optional(),
  prototype: z.never().optional(),
};

const storageRecordSchema = <Value extends z.ZodType>(value: Value) =>
  z.preprocess(
    toNullPrototypeRecord,
    z.object(reservedStorageKeyShape).catchall(value),
  ) as z.ZodType<Record<string, z.output<Value>>>;

function toNullPrototypeRecord(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (Object.hasOwn(value, "__proto__")) return null;
  return Object.assign(Object.create(null) as object, value);
}

export const workspaceResourceSchema = z.object({
  createdAt: z.string(),
  icon: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  resourceTypeId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  position: z.number().int(),
  workspaceId: z.string(),
  storage: storageRecordSchema(
    z.object({
      kind: z.enum(["file", "key-value", "yjs"]),
      storageId: z.string().min(1),
    }),
  ),
  updatedAt: z.string(),
  lastActivityAt: z.string().optional(),
});

export const WorkspaceResourceDto = workspaceResourceSchema.meta({
  id: "WorkspaceResourceDto",
});
export type WorkspaceResourceDto = Infer<typeof WorkspaceResourceDto>;
export const WorkspaceResourceActionDto = z
  .object({ id: z.string() })
  .meta({ id: "WorkspaceResourceActionDto" });
export type WorkspaceResourceActionDto = Infer<
  typeof WorkspaceResourceActionDto
>;

export const WorkspaceResourcesListQueryDto = paginationQuerySchema.meta({
  id: "WorkspaceResourcesListQueryDto",
});
export type WorkspaceResourcesListQueryDto = Infer<
  typeof WorkspaceResourcesListQueryDto
>;

export const WorkspaceResourcesListResponseDto = z
  .object({
    items: z.array(workspaceResourceSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: "WorkspaceResourcesListResponseDto" });
export type WorkspaceResourcesListResponseDto = Infer<
  typeof WorkspaceResourcesListResponseDto
>;

const mutableResourceFields = {
  icon: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  parentId: z.string().min(1).nullable().optional(),
  position: z.number().int().optional(),
};

export const createWorkspaceResourceSchema = z.object({
  ...mutableResourceFields,
  name: z.string().min(1),
  resourceTypeId: z.string().min(1),
  schemaVersion: z.number().int().positive().default(1),
  storage: storageRecordSchema(
    z.object({ kind: z.enum(["file", "key-value", "yjs"]) }).strict(),
  ),
});

export const CreateWorkspaceResourceDto = createWorkspaceResourceSchema.meta({
  id: "CreateWorkspaceResourceDto",
});
export type CreateWorkspaceResourceDto = Infer<
  typeof CreateWorkspaceResourceDto
>;

export const updateWorkspaceResourceSchema = z
  .object(mutableResourceFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const UpdateWorkspaceResourceDto = updateWorkspaceResourceSchema.meta({
  id: "UpdateWorkspaceResourceDto",
});
export type UpdateWorkspaceResourceDto = Infer<
  typeof UpdateWorkspaceResourceDto
>;

export const WorkspaceResourcesParamsDto = z
  .object({ workspaceId: z.string().min(1) })
  .meta({ id: "WorkspaceResourcesParamsDto" });
export type WorkspaceResourcesParamsDto = Infer<
  typeof WorkspaceResourcesParamsDto
>;

export const WorkspaceResourceParamsDto = z
  .object({
    resourceId: z.string().min(1),
    workspaceId: z.string().min(1),
  })
  .meta({ id: "WorkspaceResourceParamsDto" });
export type WorkspaceResourceParamsDto = Infer<
  typeof WorkspaceResourceParamsDto
>;

export const workspaceResourceCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string(),
  position: z.number().int(),
});

export type CreateWorkspaceResourceInput = z.infer<
  typeof createWorkspaceResourceSchema
>;
export type UpdateWorkspaceResourceInput = z.infer<
  typeof updateWorkspaceResourceSchema
>;
