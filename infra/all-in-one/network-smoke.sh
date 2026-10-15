#!/bin/bash
# Probe from a separate container on the same Docker network.
set -euo pipefail
container=${1:-lunaris-aio-lunaris-1}
network=$(docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$container" | head -n 1)
image=$(docker inspect --format '{{.Image}}' "$container")
address=$(docker inspect "$container" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["NetworkSettings"]["Networks"][sys.argv[1]]["IPAddress"])' "$network")
docker run --rm -i --network "$network" --entrypoint python3 "$image" - "$address" <<'PY'
import socket, sys
from urllib.request import urlopen
address = sys.argv[1]
with urlopen(f'http://{address}:8080/v1/health', timeout=10) as response:
    assert response.status == 200
for port in (3000, 8082, 3900, 3901, 5432, 6379):
    try:
        connection = socket.create_connection((address, port), timeout=3)
    except ConnectionRefusedError:
        continue
    else:
        connection.close()
        raise AssertionError(f'Internal port {port} is reachable from a peer container')
print('Peer container reaches Nginx; all internal service ports refuse connections.')
PY
