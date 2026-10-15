CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "pi_name_trgm_idx" ON "project_items" USING gin ("name" gin_trgm_ops);
