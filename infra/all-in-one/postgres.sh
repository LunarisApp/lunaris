#!/bin/bash
set -euo pipefail
exec /usr/lib/postgresql/*/bin/postgres -D /data/postgres \
  -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/run/postgresql \
  -c wal_level=logical -c max_replication_slots=10 -c max_wal_senders=10 \
  -c max_slot_wal_keep_size=2GB -c shared_buffers=128MB
