#!/usr/bin/env bash
set -euo pipefail
release_source_sha="${LUNARIS_BUILD_SHA:-${GITHUB_SHA:-}}"

if [[ "$#" -ne 4 ]]; then
  echo "Usage: publish-s3.sh <cli|desktop|desktop-windows|desktop-linux> <version> <signed|adhoc|unsigned> <dist-directory>" >&2
  exit 1
fi

component="$1"
version="$2"
signing_mode="$3"
dist_directory="$4"

for command in aws bun sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

required_environment=(
  AWS_ACCESS_KEY_ID
  AWS_DEFAULT_REGION
  AWS_SECRET_ACCESS_KEY
  RELEASES_S3_BUCKET
  release_source_sha
)
for variable in "${required_environment[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Required environment variable is empty: $variable" >&2
    exit 1
  fi
done

distribution_prefix="releases"

case "$component:$signing_mode" in
  cli:signed)
    asset_name="lunaris-cli-${version}-universal-apple-darwin.zip"
    content_type="application/zip"
    ;;
  cli:adhoc)
    asset_name="lunaris-cli-${version}-universal-apple-darwin-adhoc.zip"
    content_type="application/zip"
    ;;
  desktop:signed)
    asset_name="Lunaris-desktop-${version}-universal.dmg"
    content_type="application/x-apple-diskimage"
    ;;
  desktop:adhoc)
    asset_name="Lunaris-desktop-${version}-universal-adhoc.dmg"
    content_type="application/x-apple-diskimage"
    ;;
  desktop-windows:unsigned)
    asset_name="Lunaris-desktop-${version}-x86_64-pc-windows-msvc.exe"
    content_type="application/vnd.microsoft.portable-executable"
    ;;
  desktop-linux:unsigned)
    asset_name="Lunaris-desktop-${version}-x86_64-unknown-linux-gnu.deb"
    content_type="application/vnd.debian.binary-package"
    ;;
  *)
    echo "Unsupported component or signing mode: $component $signing_mode" >&2
    exit 1
    ;;
esac

asset_path="$dist_directory/$asset_name"
checksum_path="$dist_directory/SHA256SUMS"
if [[ ! -f "$asset_path" || ! -f "$checksum_path" ]]; then
  echo "Release asset or SHA256SUMS missing from $dist_directory" >&2
  exit 1
fi
(cd "$dist_directory" && sha256sum --check --strict SHA256SUMS)
local_sha="$(sha256sum "$asset_path" | awk '{print $1}')"

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
manifest_path="$temporary_directory/release.json"
bun tooling/release/distribution-manifest.ts \
  "$component" \
  "$version" \
  "$signing_mode" \
  "$dist_directory" > "$manifest_path"

aws_options=()
if [[ -n "${RELEASES_S3_ENDPOINT:-}" ]]; then
  aws_options+=(--endpoint-url "$RELEASES_S3_ENDPOINT")
fi
export AWS_EC2_METADATA_DISABLED=true
export AWS_REQUEST_CHECKSUM_CALCULATION=WHEN_REQUIRED
export AWS_RESPONSE_CHECKSUM_VALIDATION=WHEN_REQUIRED

object_prefix="$distribution_prefix/$component/$version"
asset_key="$object_prefix/$asset_name"
head_error="$temporary_directory/head-error"
if remote_sha="$(
  aws "${aws_options[@]}" s3api head-object \
    --bucket "$RELEASES_S3_BUCKET" \
    --key "$asset_key" \
    --query "Metadata.sha256" \
    --output text 2>"$head_error"
)"; then
  remote_commit="$(
    aws "${aws_options[@]}" s3api head-object \
      --bucket "$RELEASES_S3_BUCKET" \
      --key "$asset_key" \
      --query "Metadata.sourcecommit" \
      --output text
  )"
  if [[ "$remote_sha" != "$local_sha" || "$remote_commit" != "$release_source_sha" ]]; then
    echo "Refusing to overwrite conflicting release object: $asset_key" >&2
    exit 1
  fi
  echo "Release object already matches source and checksum: $asset_key"
else
  if ! grep -Eiq "404|Not Found|NoSuchKey" "$head_error"; then
    echo "Cannot inspect release object before upload: $asset_key" >&2
    sed -n '1,5p' "$head_error" >&2
    exit 1
  fi
  aws "${aws_options[@]}" s3 cp \
    "$asset_path" \
    "s3://$RELEASES_S3_BUCKET/$asset_key" \
    --cache-control "public,max-age=31536000,immutable" \
    --content-type "$content_type" \
    --metadata "sha256=$local_sha,sourcecommit=$release_source_sha" \
    --no-progress \
    --only-show-errors
fi

aws "${aws_options[@]}" s3 cp \
  "$checksum_path" \
  "s3://$RELEASES_S3_BUCKET/$object_prefix/SHA256SUMS" \
  --cache-control "public,max-age=31536000,immutable" \
  --content-type "text/plain" \
  --no-progress \
  --only-show-errors
aws "${aws_options[@]}" s3 cp \
  "$manifest_path" \
  "s3://$RELEASES_S3_BUCKET/$object_prefix/release.json" \
  --cache-control "public,max-age=31536000,immutable" \
  --content-type "application/json" \
  --no-progress \
  --only-show-errors

# Publish mutable channel pointer last so clients never see incomplete releases.
aws "${aws_options[@]}" s3 cp \
  "$manifest_path" \
  "s3://$RELEASES_S3_BUCKET/$distribution_prefix/$component/latest.json" \
  --cache-control "public,max-age=60,must-revalidate" \
  --content-type "application/json" \
  --no-progress \
  --only-show-errors

echo "Published $component $version to s3://$RELEASES_S3_BUCKET/$object_prefix"
