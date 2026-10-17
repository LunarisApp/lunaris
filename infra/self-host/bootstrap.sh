#!/usr/bin/env bash
# Published per release. Keep execution inside main so truncated downloads cannot
# begin installation before Bash has received the complete function.
main() {
  set -Eeuo pipefail
  set +x
  umask 077
  local version='__LUNARIS_VERSION__'
  local expected_sha256='__LUNARIS_SHA256__'
  local origin='' directory=''
  bootstrap_work='' bootstrap_lock=''
  fail() { echo "$*" >&2; exit 1; }
  for command in curl tar openssl mktemp; do
    command -v "$command" >/dev/null || fail "Missing required command: $command"
  done
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dir)
        [[ $# -ge 2 && -n $2 ]] || fail '--dir requires an installation directory.'
        directory=$2; shift 2 ;;
      --tls-mode)
        [[ $# -ge 2 && ($2 == auto || $2 == external) ]] || fail '--tls-mode requires auto or external.'
        export TLS_MODE=$2; shift 2 ;;
      --help|-h)
        echo 'Usage: curl -fsSL https://lunaris.app/install.sh | bash -s -- [PUBLIC_URL] [--dir DIRECTORY] [--tls-mode auto|external]'
        echo 'Omit PUBLIC_URL to prompt on first install; existing installations reuse .env.'
        return ;;
      http://*|https://*)
        [[ -z $origin ]] || fail 'Specify only one PUBLIC_URL.'
        origin=$1; shift ;;
      *) fail "Unknown argument: $1" ;;
    esac
  done
  [[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && $expected_sha256 =~ ^[a-f0-9]{64}$ ]] || fail 'Use the published installer at https://lunaris.app/install.sh.'
  if [[ -z $directory ]]; then
    if [[ -f release.json && -f compose.yaml ]]; then directory=$PWD; else directory="$PWD/lunaris"; fi
  fi
  mkdir -p -- "$directory"
  directory=$(cd -- "$directory" && pwd -P)
  if [[ ! -f "$directory/release.json" && -n $(ls -A -- "$directory") ]]; then
    fail 'Choose an empty directory or an existing Lunaris installation with --dir.'
  fi
  [[ ! -d "$directory/.install.lock" ]] || fail 'Installer already running in this directory.'
  bootstrap_lock="$directory/.bootstrap.lock"
  mkdir "$bootstrap_lock" 2>/dev/null || fail 'Another download is active. Remove .bootstrap.lock only after confirming no installer is running.'
  trap '[[ -z $bootstrap_work ]] || rm -rf -- "$bootstrap_work"; rmdir -- "$bootstrap_lock" 2>/dev/null || true' EXIT
  bootstrap_work=$(mktemp -d)
  echo "Downloading Lunaris $version..."
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --connect-timeout 15 --max-time 300 --retry 3 \
    "https://github.com/LunarisApp/lunaris/releases/download/self-hosted%40${version}/lunaris-self-hosted-${version}.tar.gz" \
    --output "$bootstrap_work/bundle.tar.gz"
  local actual
  actual=$(openssl dgst -sha256 "$bootstrap_work/bundle.tar.gz")
  [[ ${actual##* } == "$expected_sha256" ]] || fail 'Bundle checksum mismatch. Installation files were not changed.'
  # Preserve readable config modes for non-root container users despite umask 077.
  # Ownership stays with the operator; generated secrets are not in the archive.
  tar --no-same-owner -xzpf "$bootstrap_work/bundle.tar.gz" -C "$directory"
  echo "Installation directory: $directory"
  if [[ -n $origin ]]; then
    bash "$directory/install.sh" "$origin" </dev/null
  else
    bash "$directory/install.sh" </dev/null
  fi
}
main "$@"
