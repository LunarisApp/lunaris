CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'system', 'api', 'agent');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'failure', 'denied');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"target_type" text,
	"target_id" text,
	"tenant_id" text,
	"reason" text,
	"changes" jsonb,
	"target" jsonb,
	"context" jsonb,
	"event" jsonb NOT NULL,
	"request_id" text,
	"trace_id" text,
	"ip_address" text,
	"user_agent" text,
	"causation_id" text,
	"correlation_id" text,
	"schema_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"signature" text NOT NULL,
	"signature_key_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_idempotency_unique" ON "audit_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "audit_events_tenant_occurred_idx" ON "audit_events" USING btree ("tenant_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_tenant_action_occurred_idx" ON "audit_events" USING btree ("tenant_id","action","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_actor_occurred_idx" ON "audit_events" USING btree ("actor_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_outcome_occurred_idx" ON "audit_events" USING btree ("outcome","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE FUNCTION "audit_events_reject_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_events is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_immutable"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_mutation"();--> statement-breakpoint
CREATE FUNCTION "purge_expired_audit_events"(cutoff timestamptz)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
	deleted_count bigint;
BEGIN
	IF cutoff > now() - interval '7 years' THEN
		RAISE EXCEPTION 'audit retention cutoff must be at least 7 years old';
	END IF;
	ALTER TABLE public.audit_events DISABLE TRIGGER audit_events_immutable;
	DELETE FROM public.audit_events WHERE occurred_at < cutoff;
	GET DIAGNOSTICS deleted_count = ROW_COUNT;
	ALTER TABLE public.audit_events ENABLE TRIGGER audit_events_immutable;
	RETURN deleted_count;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "purge_expired_audit_events"(timestamptz) FROM PUBLIC;
