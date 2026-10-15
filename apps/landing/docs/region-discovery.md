# Lunaris region discovery

Lunaris clients discover official data regions from:

```text
https://lunaris.app/.well-known/lunaris-regions
```

This directory is authoritative for region membership, display order, and lifecycle. The manifest linked by each
routable region is authoritative for that region's API, PowerSync, and storage endpoints.

## Directory schema

The directory is public, unauthenticated JSON with this version 1 shape:

```json
{
  "schemaVersion": 1,
  "regions": [
    {
      "regionId": "us",
      "displayName": "United States",
      "status": "available",
      "manifestUrl": "https://api-us.lunaris.app/v1/manifest"
    },
    {
      "regionId": "eu",
      "displayName": "European Union",
      "status": "planned"
    }
  ]
}
```

Region IDs are permanent lowercase slugs and must never be reused. Entries appear in picker order. The English
`displayName` is a fallback for clients that do not have a localized name for a region.

The supported lifecycle states are:

- `planned`: visible but not selectable and has no `manifestUrl`.
- `available`: selectable and has an HTTPS `manifestUrl`.
- `deprecated`: not selectable for new organizations, but still has an HTTPS `manifestUrl` for existing organizations.

Clients must ignore additive fields. An unknown lifecycle state is nonselectable. An unsupported `schemaVersion` is a
contract failure and triggers the client's cached-directory fallback.

## Client behavior

Clients fetch the directory without credentials and persist only documents that pass validation. New synced organizations
may use a last-known-good directory for up to 24 hours when discovery is unavailable. After that, clients offer retry or
local-only setup instead of guessing a region.

After a user selects an available region, the client fetches its manifest and verifies that the manifest `regionId`
matches the directory entry and all service endpoints use HTTPS. Existing organizations retain their selected region and
last-known manifest during discovery outages. Clients never fail over an organization to another region automatically.

Regional manifests use schema version 1 while retaining the existing endpoint fields:

```json
{
  "schemaVersion": 1,
  "regionId": "us",
  "apiUrl": "https://api-us.lunaris.app",
  "powersyncUrl": "https://sync-us.lunaris.app",
  "storageUrl": "https://t3.storageapi.dev"
}
```

## Region lifecycle

To activate a region, deploy its DNS and services first, expose and verify its manifest, and change the directory entry
from `planned` to `available` last. Temporary outages do not change lifecycle status.

To retire a region, change it to `deprecated`, migrate all dependent organizations, and remove it only after nothing relies
on it. Region IDs are not recycled.

## Verification

Run the production smoke check with:

```sh
bun run check:regions
```

The check validates the directory headers and schema, `GET`, `HEAD`, conditional requests, and every available or
deprecated regional manifest. To check a local directory route before regional manifests implement the public v1
contract, run:

```sh
REGION_DIRECTORY_URL=http://localhost:3000/.well-known/lunaris-regions \
REGION_DISCOVERY_SKIP_MANIFESTS=1 \
bun run check:regions
```

Before requesting a provisional IANA registration for `lunaris-regions`, publish this contract at a stable public URL
and use that URL as the registration's specification document.

## Server directory for CLI and desktop login

`/.well-known/lunaris-servers` exposes `{ schemaVersion: 1, servers: [...] }`.
Each entry uses `serverId`, `displayName`, `status`, and an optional `manifestUrl`.
It uses the canonical region list: available and planned entries retain their
order; deprecated regions are omitted from new-server discovery. Available
entries link to `/v1/manifest`; planned entries have no manifest URL.

The route supports GET, HEAD, ETag revalidation, and unauthenticated cross-origin
requests. The region directory remains available for region selection.

Deploy landing first and verify that the production server directory returns
HTTP 200 with the server contract before releasing updated CLI or desktop
clients. These clients no longer fall back to the region directory on errors.
