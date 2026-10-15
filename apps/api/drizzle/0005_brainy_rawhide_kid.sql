ALTER TABLE "project_data" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "project_data" ADD COLUMN "synced_created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "project_data" ADD COLUMN "synced_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "synced_created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "synced_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD COLUMN "synced_created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_document_updates" ADD COLUMN "synced_updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD COLUMN "updated_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD COLUMN "synced_created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "yjs_documents" ADD COLUMN "synced_updated_at" timestamp DEFAULT now() NOT NULL;