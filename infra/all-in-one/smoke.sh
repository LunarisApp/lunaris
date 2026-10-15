#!/bin/bash
# Run against an already started installation; read-only probes.
set -euo pipefail
origin=${1:-http://localhost:8080}
curl --fail --silent --show-error "$origin/.well-known/security.txt" | grep -q '^Contact:'
curl --fail --silent --show-error "$origin/regions.json" | python3 -c 'import json,sys; assert json.load(sys.stdin)["regions"][0]["regionId"] == "selfhost"'
python3 - "$origin" <<'PY'
import json, sys
from urllib.request import Request, urlopen

origin = sys.argv[1]
for kind, key in [('regions', 'regionId'), ('servers', 'serverId')]:
    url = origin + '/.well-known/lunaris-' + kind
    with urlopen(url) as response:
        assert response.headers.get_content_type() == 'application/json'
        assert response.headers['Access-Control-Allow-Origin'] == '*'
        directory = json.load(response)
    assert directory['schemaVersion'] == 1
    entry, = directory[kind]
    assert entry[key] == 'selfhost' and entry['status'] == 'available'
    with urlopen(entry['manifestUrl']) as response:
        assert json.load(response)['serverId'] == entry[key]
    with urlopen(Request(url, method='HEAD')) as response:
        assert response.status == 200 and response.read() == b''
# Exercise every frontend auth route directly (including browser refresh),
# while checking colliding API paths keep their semantics.
for route in ['', '/email', '/continue', '/register', '/forgot-password',
              '/reset-password', '/two-factor', '/verify-email', '/onboarding',
              '/accept-invitation', '/agent-consent']:
    for method in ['GET', 'HEAD']:
        with urlopen(Request(origin + '/auth' + route, method=method)) as response:
            assert response.headers.get_content_type() == 'text/html', route
            assert response.status == 200
with urlopen(origin + '/auth/get-session') as response:
    assert response.headers.get_content_type() == 'application/json'
with urlopen(origin + '/auth/jwks') as response:
    assert json.load(response)['keys']
from urllib.error import HTTPError
for path, data in [('/auth/verify-email?token=invalid', None),
                   ('/auth/reset-password', b'{}')]:
    try:
        response = urlopen(Request(origin + path, data=data,
                           headers={'Content-Type': 'application/json'}))
    except HTTPError as error:
        response = error
    with response:
        # API may redirect invalid verification links to its error endpoint.
        assert response.headers.get_content_type() != 'text/html' or '/auth/error' in response.url
print('Auth pages GET/HEAD and API routing passed.')
print('Server and region discovery GET/HEAD, JSON, CORS, and manifest links passed.')
PY
curl --fail --silent --show-error "$origin/v1/manifest" | python3 -c 'import json,sys; assert json.load(sys.stdin)["serverId"] == "selfhost"'
curl --fail --silent --show-error "$origin/v1/health" >/dev/null
curl --fail --silent --show-error "$origin/sync/probes/readiness" >/dev/null
curl --fail --silent --show-error "$origin/" | grep -q '<!doctype html>'
echo 'Web, region discovery, API, storage/database health, and sync probes passed.'
