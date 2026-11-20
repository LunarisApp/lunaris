#!/usr/bin/env bash
set -euo pipefail

target=$1
version=${PRODUCT_VERSION:?PRODUCT_VERSION is required}
case "$target" in
  x86_64-pc-windows-msvc)
    binary=lunaris.exe
    extension=zip
    ;;
  x86_64-unknown-linux-gnu|aarch64-unknown-linux-gnu)
    binary=lunaris
    extension=tar.gz
    ;;
  *) echo "Unsupported CLI release target: $target" >&2; exit 1 ;;
esac

package_dir="dist/package"
asset="lunaris-cli-$version-$target.$extension"
mkdir -p "$package_dir"
cp "target/$target/release/$binary" "apps/cli/LICENSE" "$package_dir/"
cargo about generate \
  --manifest-path apps/cli/Cargo.toml \
  --config apps/cli/about.toml \
  --target "$target" \
  --locked \
  --fail \
  --output-file "$package_dir/THIRD-PARTY-LICENSES.txt" \
  apps/cli/about.hbs

if [[ $extension == zip ]]; then
  windows_tar="$(cygpath -u -S)/tar.exe"
  "$windows_tar" -a -cf "dist/$asset" -C "$package_dir" "$binary" LICENSE THIRD-PARTY-LICENSES.txt
  "$windows_tar" -tf "dist/$asset"
else
  tar -czf "dist/$asset" -C "$package_dir" "$binary" LICENSE THIRD-PARTY-LICENSES.txt
  tar -tzf "dist/$asset"
fi
(cd dist && sha256sum "$asset" > SHA256SUMS)
