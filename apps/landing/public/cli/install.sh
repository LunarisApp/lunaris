#!/usr/bin/env bash
# Wait for the complete script before executing a piped download.
main() (
  set -euo pipefail
  local releases=https://github.com/LunarisApp/lunaris/releases
  local target extension
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64|Darwin:x86_64)
      target='universal-apple-darwin(-adhoc)?'
      extension=zip
      ;;
    Linux:x86_64) target=x86_64-unknown-linux-gnu; extension=tar.gz ;;
    Linux:aarch64) target=aarch64-unknown-linux-gnu; extension=tar.gz ;;
    *) echo 'Lunaris CLI is unavailable for this system.' >&2; return 1 ;;
  esac

  local manifest pattern checksum version asset line
  manifest=$(download "$releases/latest/download/SHA256SUMS")
  pattern="^([0-9a-f]{64})[[:blank:]]+\*?(lunaris-cli-([0-9]+\.[0-9]+\.[0-9]+)-$target\.${extension//./\\.})$"
  while IFS= read -r line; do
    if [[ $line =~ $pattern ]]; then
      if [[ -n ${asset:-} ]]; then
        echo 'The release lists multiple CLI archives for this system.' >&2
        return 1
      fi
      checksum=${BASH_REMATCH[1]}
      asset=${BASH_REMATCH[2]}
      version=${BASH_REMATCH[3]}
    fi
  done <<< "$manifest"
  if [[ -z ${asset:-} ]]; then
    echo 'The latest Lunaris release has no CLI archive for this system.' >&2
    return 1
  fi

  local actual install_dir work staging=''
  work=$(mktemp -d)
  trap 'rm -rf -- "$work"; if [[ -n $staging ]]; then rm -rf -- "$staging"; fi' EXIT
  download "$releases/download/v$version/$asset" --output "$work/$asset"
  actual=$(openssl dgst -sha256 "$work/$asset")
  if [[ ${actual##* } != "$checksum" ]]; then
    echo 'CLI archive checksum mismatch.' >&2
    return 1
  fi
  if [[ $extension == zip ]]; then
    unzip -q "$work/$asset" -d "$work"
  else
    tar -xzf "$work/$asset" -C "$work"
  fi

  install_dir=${LUNARIS_INSTALL_DIR:-"$HOME/.local/bin"}
  mkdir -p -- "$install_dir"
  staging=$(mktemp -d -- "$install_dir/.lunaris.XXXXXXXX")
  install -m 755 "$work/lunaris" "$staging/lunaris"
  install -m 644 "$work/LICENSE" "$staging/lunaris-LICENSE.txt"
  install -m 644 "$work/THIRD-PARTY-LICENSES.txt" "$staging/lunaris-THIRD-PARTY-LICENSES.txt"
  local name
  local files=(lunaris-LICENSE.txt lunaris-THIRD-PARTY-LICENSES.txt lunaris)
  for name in "${files[@]}"; do
    if [[ -d "$install_dir/$name" ]]; then
      printf 'Cannot install over directory %s\n' "$install_dir/$name" >&2
      return 1
    fi
  done
  for name in "${files[@]}"; do
    mv -f -- "$staging/$name" "$install_dir/$name"
  done
  printf 'Installed Lunaris CLI %s to %s\n' "$version" "$install_dir/lunaris"
  case ":${PATH:-}:" in
    *":$install_dir:"*) ;;
    *) printf 'Add %s to PATH to use the lunaris command.\n' "$install_dir" ;;
  esac
)

download() {
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 300 --retry 3 "$@"
}

main "$@"
