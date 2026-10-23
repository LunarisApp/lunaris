#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
revision=$(git rev-parse HEAD)
cache=()
if [[ ${GITHUB_ACTIONS:-false} == true ]]; then
  cache=(--cache-from "type=gha,scope=self-host-community-$(uname -m)" --cache-to "type=gha,scope=self-host-community-$(uname -m),mode=max")
fi
for target in api web; do
  docker buildx build "${cache[@]}" --load -f infra/self-host/Dockerfile --target "$target" \
    --build-arg LUNARIS_EDITION=community \
    --label "org.opencontainers.image.revision=$revision" \
    --label org.opencontainers.image.source=https://github.com/LunarisApp/lunaris \
    -t "lunaris:self-host-$target-test" .
done
