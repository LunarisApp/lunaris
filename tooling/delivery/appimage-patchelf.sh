#!/usr/bin/env bash
set -euo pipefail

# Bun's compiled program lives inside the ELF file. Rewriting its RPATH can
# corrupt that payload. The agent only needs system libraries, so preserve it.
# linuxdeploy supports PATCHELF and passes this override to its GTK plugin too.
if [ "$#" -eq 3 ] && [ "$1" = --set-rpath ]; then
  case "$3" in
    */*.AppDir/usr/bin/lunaris-agent) exit 0 ;;
  esac
fi

# Keep normal handling for desktop executables, shared libraries and reads.
exec patchelf "$@"
