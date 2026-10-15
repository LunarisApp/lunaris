INSERT INTO "workspace_plugins" (
	"organization_id",
	"plugin_id",
	"version",
	"installed_by"
)
SELECT "id", 'lunaris.excalidraw', '1.0.0', NULL
FROM "organization"
ON CONFLICT ("organization_id", "plugin_id") DO NOTHING;--> statement-breakpoint
CREATE FUNCTION "install_default_excalidraw"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	INSERT INTO public.workspace_plugins (
		organization_id,
		plugin_id,
		version,
		installed_by
	)
	VALUES (NEW.id, 'lunaris.excalidraw', '1.0.0', NULL)
	ON CONFLICT (organization_id, plugin_id) DO NOTHING;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "organization_install_default_excalidraw"
AFTER INSERT ON "organization"
FOR EACH ROW EXECUTE FUNCTION "install_default_excalidraw"();
