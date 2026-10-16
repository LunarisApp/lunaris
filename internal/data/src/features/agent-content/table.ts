import { column, Table } from "@powersync/common";

export const AGENT_IDEMPOTENCY_TABLE = "agent_idempotency";
export const AGENT_ACTION_PREVIEWS_TABLE = "agent_action_previews";

export const createAgentIdempotencyTable = () =>
  new Table(
    {
      actor_id: column.text,
      created_at: column.text,
      expires_at: column.text,
      key: column.text,
      operation: column.text,
      request_hash: column.text,
      response: column.text,
      status: column.text,
    },
    { localOnly: true, viewName: AGENT_IDEMPOTENCY_TABLE }
  );

export const createAgentActionPreviewsTable = () =>
  new Table(
    {
      action: column.text,
      actor_id: column.text,
      created_at: column.text,
      expires_at: column.text,
      fingerprint: column.text,
      impact: column.text,
      target_id: column.text,
      token_hash: column.text,
      used_at: column.text,
      organization_id: column.text,
    },
    { localOnly: true, viewName: AGENT_ACTION_PREVIEWS_TABLE }
  );
