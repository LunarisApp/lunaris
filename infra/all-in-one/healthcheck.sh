#!/bin/bash
# Readiness only: no restart decisions or mutations.
set -euo pipefail
source /data/secrets.env
exec python3 /opt/aio/readiness.py
