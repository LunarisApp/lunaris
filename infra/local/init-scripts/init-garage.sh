#!/bin/sh
set -eu

apk add --no-cache -q curl jq > /dev/null 2>&1

ADMIN="http://garage:3903"
TOKEN="admin-dev-token"
BUCKET="${AWS_S3_BUCKET:-lunaris}"
KEY_ID="${AWS_ACCESS_KEY_ID:-GKdeadbeefcafeface12345678}"
KEY_SECRET="${AWS_SECRET_ACCESS_KEY:-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef}"

get() {
  curl --fail-with-body --silent --show-error --header "Authorization: Bearer $TOKEN" "${ADMIN}${1}" || { echo "Garage GET $1 failed" >&2; return 1; }
}

post() {
  curl --fail-with-body --silent --show-error --header "Authorization: Bearer $TOKEN" \
    --header "Content-Type: application/json" --data "$2" "${ADMIN}${1}" || { echo "Garage POST $1 failed" >&2; return 1; }
}

NODE_ID=$(get '/v2/GetNodeInfo?node=self' | jq -er '.success | to_entries | first | .value.nodeId')
VERSION=$(get /v2/GetClusterLayout | jq -er '.version')
if [ "$VERSION" -eq 0 ]; then
  post /v2/UpdateClusterLayout "$(jq -nc --arg id "$NODE_ID" \
    '{roles:[{id:$id,zone:"dc1",capacity:1073741824,tags:[]}]}')" > /dev/null
  post /v2/ApplyClusterLayout '{"version":1}' > /dev/null
fi

if ! get "/v2/GetKeyInfo?id=$KEY_ID" > /dev/null 2>&1; then
  post /v2/ImportKey "$(jq -nc --arg id "$KEY_ID" --arg secret "$KEY_SECRET" \
    '{accessKeyId:$id,secretAccessKey:$secret,name:"dev-key"}')" > /dev/null
fi

BUCKET_ALIAS=$(printf '%s' "$BUCKET" | jq -sRr @uri)
if ! BUCKET_INFO=$(get "/v2/GetBucketInfo?globalAlias=$BUCKET_ALIAS" 2>/dev/null); then
  BUCKET_INFO=$(post /v2/CreateBucket "$(jq -nc --arg alias "$BUCKET" '{globalAlias:$alias}')")
fi
BUCKET_ID=$(printf '%s' "$BUCKET_INFO" | jq -er '.id')
post /v2/AllowBucketKey "$(jq -nc --arg bucket "$BUCKET_ID" --arg key "$KEY_ID" \
  '{bucketId:$bucket,accessKeyId:$key,permissions:{read:true,write:true,owner:true}}')" > /dev/null

echo "Garage initialized: bucket=$BUCKET key=$KEY_ID"
