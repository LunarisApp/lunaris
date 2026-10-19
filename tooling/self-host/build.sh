#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
revision=$(git rev-parse HEAD)
for target in api web; do
  docker buildx build --load -f infra/self-host/Dockerfile --target "$target" \
    --build-arg LUNARIS_EDITION=community \
    --label "org.opencontainers.image.revision=$revision" \
    --label org.opencontainers.image.source=https://github.com/LunarisApp/lunaris \
    -t "lunaris:self-host-$target-test" .
done
