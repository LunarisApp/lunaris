ALTER TABLE "workspaces" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "workspace_resources" ADD COLUMN "last_activity_at" timestamp;--> statement-breakpoint
-- Activity is separate from metadata revisions. Only move it forward.
CREATE FUNCTION lunaris_record_activity(workspace text, resource text, happened_at timestamp)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF happened_at IS NULL THEN RETURN; END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM workspace_resources WHERE id = resource AND workspace_id = workspace
    UNION
    SELECT parent.id, parent.parent_id FROM workspace_resources parent
    JOIN ancestors child ON parent.id = child.parent_id
    WHERE parent.workspace_id = workspace
  )
  UPDATE workspace_resources SET last_activity_at = happened_at
  WHERE id IN (SELECT id FROM ancestors)
    AND happened_at > COALESCE(last_activity_at, updated_at, created_at);
  UPDATE workspaces SET last_activity_at = happened_at
  WHERE id = workspace AND happened_at > COALESCE(last_activity_at, updated_at, created_at);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION lunaris_preserve_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.last_activity_at := GREATEST(OLD.last_activity_at, NEW.last_activity_at, NEW.updated_at);
  ELSE
    NEW.last_activity_at := GREATEST(NEW.last_activity_at, NEW.updated_at, NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workspaces_preserve_activity BEFORE INSERT OR UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION lunaris_preserve_activity();
--> statement-breakpoint
CREATE TRIGGER resources_preserve_activity BEFORE INSERT OR UPDATE ON workspace_resources
FOR EACH ROW EXECUTE FUNCTION lunaris_preserve_activity();
--> statement-breakpoint
CREATE FUNCTION lunaris_resource_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at timestamp;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM lunaris_record_activity(OLD.workspace_id, OLD.parent_id, timezone('UTC', clock_timestamp()));
    RETURN OLD;
  END IF;
  -- Activity-only propagation must not recursively fire another propagation.
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['last_activity_at', 'synced_updated_at']) =
    (to_jsonb(OLD) - ARRAY['last_activity_at', 'synced_updated_at']) THEN RETURN NEW; END IF;
  at := NEW.updated_at;
  IF TG_OP = 'UPDATE' AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    PERFORM lunaris_record_activity(OLD.workspace_id, OLD.parent_id, at);
  END IF;
  PERFORM lunaris_record_activity(NEW.workspace_id, NEW.parent_id, GREATEST(at, NEW.last_activity_at));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resources_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_resources
FOR EACH ROW EXECUTE FUNCTION lunaris_resource_activity();
--> statement-breakpoint
CREATE FUNCTION lunaris_storage_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; at timestamp; resource text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  -- Allocating an empty storage handle on open is bookkeeping, not an edit.
  IF TG_TABLE_NAME = 'workspace_storage_slots' AND TG_OP = 'INSERT'
    AND row_data->>'metadata' IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['updated_at', 'synced_updated_at']) =
    (to_jsonb(OLD) - ARRAY['updated_at', 'synced_updated_at']) THEN RETURN NEW; END IF;
  at := CASE WHEN TG_OP = 'DELETE' THEN timezone('UTC', clock_timestamp())
    ELSE (row_data->>'updated_at')::timestamp END;
  IF TG_TABLE_NAME = 'workspace_storage_slots' THEN
    resource := row_data->>'resource_id';
  ELSE
    SELECT resource_id INTO resource FROM workspace_storage_slots
    WHERE id = row_data->>'storage_id' AND workspace_id = row_data->>'workspace_id';
  END IF;
  PERFORM lunaris_record_activity(row_data->>'workspace_id', resource, at);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER storage_slots_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_storage_slots
FOR EACH ROW EXECUTE FUNCTION lunaris_storage_activity();
--> statement-breakpoint
CREATE TRIGGER storage_values_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_storage_values
FOR EACH ROW EXECUTE FUNCTION lunaris_storage_activity();
--> statement-breakpoint
CREATE FUNCTION lunaris_yjs_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE slot record;
BEGIN
  UPDATE yjs_documents SET updated_at = NEW.updated_at
  WHERE id = NEW.document_id AND workspace_id = NEW.workspace_id AND updated_at < NEW.updated_at;
  -- Compaction preserves updated_at; replay and compaction cannot advance activity.
  FOR slot IN SELECT resource_id FROM workspace_storage_slots
    WHERE workspace_id = NEW.workspace_id AND kind = 'yjs' AND backing_id = NEW.document_id
  LOOP
    PERFORM lunaris_record_activity(NEW.workspace_id, slot.resource_id, NEW.updated_at);
  END LOOP;
  PERFORM lunaris_record_activity(NEW.workspace_id, NULL, NEW.updated_at);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER yjs_updates_activity AFTER INSERT ON yjs_document_updates
FOR EACH ROW EXECUTE FUNCTION lunaris_yjs_activity();
--> statement-breakpoint
CREATE FUNCTION lunaris_workspace_child_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; at timestamp;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['updated_at', 'synced_updated_at']) =
    (to_jsonb(OLD) - ARRAY['updated_at', 'synced_updated_at']) THEN RETURN NEW; END IF;
  at := CASE WHEN TG_OP = 'DELETE' THEN timezone('UTC', clock_timestamp())
    ELSE COALESCE(row_data->>'trashed_at', row_data->>'updated_at', row_data->>'created_at')::timestamp END;
  PERFORM lunaris_record_activity(row_data->>'workspace_id',
    CASE WHEN TG_TABLE_NAME = 'workspace_resource_trash' THEN row_data->>'id' END, at);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER resource_trash_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_resource_trash
FOR EACH ROW EXECUTE FUNCTION lunaris_workspace_child_activity();
--> statement-breakpoint
CREATE TRIGGER workspace_extensions_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_extensions
FOR EACH ROW EXECUTE FUNCTION lunaris_workspace_child_activity();
--> statement-breakpoint
CREATE TRIGGER workspace_members_activity AFTER INSERT OR UPDATE OR DELETE ON workspace_members
FOR EACH ROW EXECUTE FUNCTION lunaris_workspace_child_activity();
--> statement-breakpoint
CREATE FUNCTION lunaris_preserve_document_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := GREATEST(OLD.updated_at, NEW.updated_at);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER documents_preserve_updated_at BEFORE UPDATE ON yjs_documents
FOR EACH ROW EXECUTE FUNCTION lunaris_preserve_document_updated_at();
--> statement-breakpoint
UPDATE yjs_documents d SET updated_at = latest.at FROM (
  SELECT document_id, MAX(updated_at) AS at FROM yjs_document_updates GROUP BY document_id
) latest WHERE d.id = latest.document_id AND d.updated_at < latest.at;
--> statement-breakpoint
-- Recover known history, without pretending migration time was an edit.
WITH RECURSIVE activity(workspace_id, id, parent_id, at) AS (
  SELECT r.workspace_id, r.id, r.parent_id, GREATEST(r.updated_at,
    (SELECT MAX(t.trashed_at) FROM workspace_resource_trash t WHERE t.id = r.id),
    (SELECT MAX(d.updated_at) FROM yjs_documents d JOIN workspace_storage_slots s ON s.backing_id = d.id AND s.kind = 'yjs' WHERE s.resource_id = r.id),
    (SELECT MAX(s.updated_at) FROM workspace_storage_slots s WHERE s.resource_id = r.id),
    (SELECT MAX(v.updated_at) FROM workspace_storage_values v JOIN workspace_storage_slots s ON s.id = v.storage_id WHERE s.resource_id = r.id),
    (SELECT MAX(u.updated_at) FROM yjs_document_updates u JOIN workspace_storage_slots s ON s.backing_id = u.document_id AND s.kind = 'yjs' WHERE s.resource_id = r.id)
  ) FROM workspace_resources r
  UNION
  SELECT parent.workspace_id, parent.id, parent.parent_id, child.at
  FROM workspace_resources parent JOIN activity child ON parent.id = child.parent_id AND parent.workspace_id = child.workspace_id
), latest AS (SELECT id, MAX(at) AS at FROM activity GROUP BY id)
UPDATE workspace_resources r SET last_activity_at = latest.at FROM latest WHERE r.id = latest.id;
--> statement-breakpoint
UPDATE workspaces w SET last_activity_at = GREATEST(w.updated_at,
  (SELECT MAX(t.trashed_at) FROM workspace_resource_trash t WHERE t.workspace_id = w.id),
  (SELECT MAX(s.updated_at) FROM workspace_storage_slots s WHERE s.workspace_id = w.id AND s.metadata IS NOT NULL),
  (SELECT MAX(d.updated_at) FROM yjs_documents d WHERE d.workspace_id = w.id),
  (SELECT MAX(r.last_activity_at) FROM workspace_resources r WHERE r.workspace_id = w.id),
  (SELECT MAX(u.updated_at) FROM yjs_document_updates u WHERE u.workspace_id = w.id),
  (SELECT MAX(v.updated_at) FROM workspace_storage_values v WHERE v.workspace_id = w.id),
  (SELECT MAX(e.updated_at) FROM workspace_extensions e WHERE e.workspace_id = w.id),
  (SELECT MAX(m.updated_at) FROM workspace_members m WHERE m.workspace_id = w.id));
