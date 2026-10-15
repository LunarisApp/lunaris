-- https://docs.powersync.com/intro/setup-guide
-- Prerequisites (must be run manually, cannot run inside a transaction):
--   ALTER SYSTEM SET wal_level = logical;
--   -- Then restart PostgreSQL
-- For local dev, wal_level is set via docker-compose command args.

CREATE PUBLICATION powersync FOR TABLE projects, project_data, yjs_documents, yjs_document_updates;
