ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "account"
		WHERE "provider_id" NOT IN ('credential', 'google')
	) THEN
		RAISE EXCEPTION 'Cannot migrate account issuer: unsupported provider_id';
	END IF;
END $$;--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE "provider_id"
	WHEN 'credential' THEN 'local:credential'
	WHEN 'google' THEN 'local:oauth:google'
END;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "account"
		GROUP BY "issuer", "account_id"
		HAVING COUNT(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot migrate account issuer: duplicate account identity';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");
