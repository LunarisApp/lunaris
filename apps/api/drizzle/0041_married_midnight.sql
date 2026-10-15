CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"membership_key" text,
	"created_at" timestamp,
	CONSTRAINT "team_member_membership_key_unique" UNIQUE("membership_key")
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");
--> statement-breakpoint
INSERT INTO "team" (
	"id", "name", "member_count", "organization_id", "created_at", "updated_at"
)
SELECT
	'team_' || md5("id"), "name", 0, "id", now(), now()
FROM "organization"
WHERE "is_personal" = false;
--> statement-breakpoint
INSERT INTO "team_member" (
	"id", "team_id", "user_id", "created_at"
)
SELECT
	'team_member_' || md5(team."id" || ':' || member."user_id"),
	team."id",
	member."user_id",
	now()
FROM "team" team
INNER JOIN "member" member
	ON member."organization_id" = team."organization_id"
	AND 'owner' = ANY(
		string_to_array(replace(member."role", ' ', ''), ',')
	);
--> statement-breakpoint
UPDATE "team" team
SET "member_count" = (
	SELECT count(*) FROM "team_member" WHERE "team_id" = team."id"
);
--> statement-breakpoint
ALTER PUBLICATION powersync ADD TABLE team, team_member;
