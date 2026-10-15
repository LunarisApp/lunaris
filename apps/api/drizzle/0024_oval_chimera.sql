WITH ranked_project_data AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "project_id", "plugin_id", "key"
			ORDER BY "updated_at" DESC, "synced_updated_at" DESC, "id" DESC
		) AS "rank"
	FROM "project_data"
)
DELETE FROM "project_data"
USING ranked_project_data
WHERE "project_data"."id" = ranked_project_data."id"
	AND ranked_project_data."rank" > 1;--> statement-breakpoint
DROP INDEX "project_plugin_idx";--> statement-breakpoint
DROP INDEX "project_plugin_key_idx";--> statement-breakpoint
ALTER TABLE "project_data" ADD CONSTRAINT "project_data_project_plugin_key_unique" UNIQUE("project_id","plugin_id","key");
