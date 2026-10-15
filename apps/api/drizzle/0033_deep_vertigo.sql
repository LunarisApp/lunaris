UPDATE "member"
SET "role" = CASE
  WHEN "role" = 'admin' THEN 'editor'
  WHEN "role" = 'member' THEN 'editor'
  ELSE "role"
END
WHERE "role" IN ('admin', 'member');
--> statement-breakpoint
UPDATE "invitation"
SET "role" = CASE
  WHEN "role" = 'admin' THEN 'editor'
  WHEN "role" = 'member' THEN 'editor'
  ELSE "role"
END
WHERE "role" IN ('admin', 'member');
--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'viewer';
