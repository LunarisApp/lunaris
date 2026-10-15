#!/bin/sh
set -e

apk add --no-cache -q jq > /dev/null 2>&1

ADMIN="http://garage:3903"
TOKEN="admin-dev-token"
BUCKET="${AWS_S3_BUCKET:-lunaris}"
KEY_ID="${AWS_ACCESS_KEY_ID:-GKdeadbeefcafeface12345678}"
KEY_SECRET="${AWS_SECRET_ACCESS_KEY:-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef}"

get() {
  wget -qO- --header="Authorization: Bearer $TOKEN" "${ADMIN}${1}" 2>/dev/null || true
}

post() {
  wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
    --post-data="$2" "${ADMIN}${1}" 2>/dev/null || true
}

# 1. Get node ID
NODE_ID=$(get /v1/status | jq -r '.node')
if [ -z "$NODE_ID" ] || [ "$NODE_ID" = "null" ]; then
  echo "ERROR: Could not get node ID"
  exit 1
fi

# 2. Stage and apply layout
post /v1/layout "[{\"id\":\"$NODE_ID\",\"zone\":\"dc1\",\"capacity\":1073741824,\"tags\":[]}]" > /dev/null
VERSION=$(get /v1/layout | jq -r '.version')
post /v1/layout/apply "{\"version\":$((VERSION + 1))}" > /dev/null

# 3. Import key
post /v1/key/import "{\"accessKeyId\":\"$KEY_ID\",\"secretAccessKey\":\"$KEY_SECRET\",\"name\":\"dev-key\"}" > /dev/null

# 4. Create bucket and grant permissions
post /v1/bucket "{\"globalAlias\":\"$BUCKET\"}" > /dev/null
BUCKET_ID=$(get "/v1/bucket?alias=$BUCKET" | jq -r '.[0].id')
if [ -n "$BUCKET_ID" ] && [ "$BUCKET_ID" != "null" ]; then
  post /v1/bucket/allow "{\"bucketId\":\"$BUCKET_ID\",\"accessKeyId\":\"$KEY_ID\",\"permissions\":{\"read\":true,\"write\":true,\"owner\":true}}" > /dev/null
fi

echo "Garage initialized: bucket=$BUCKET key=$KEY_ID"
