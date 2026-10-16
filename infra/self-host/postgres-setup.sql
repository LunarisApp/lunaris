-- Passwords arrive via psql variables, never interpolated SQL literals.
SELECT 'CREATE ROLE lunaris LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='lunaris')\gexec
ALTER ROLE lunaris PASSWORD :'database_password';
SELECT 'CREATE ROLE powersync LOGIN REPLICATION' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='powersync')\gexec
ALTER ROLE powersync PASSWORD :'powersync_password';
SELECT 'CREATE DATABASE lunaris OWNER lunaris' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='lunaris')\gexec
SELECT 'CREATE DATABASE powersync_storage OWNER powersync' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='powersync_storage')\gexec
