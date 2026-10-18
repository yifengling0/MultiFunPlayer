#!/bin/bash
# Read-only checks; no downloads, license acceptance, or settings changes.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TOOLS=${HARMONY_TOOLS_HOME:-$HERE/../harmony-tools-26.0.0.851/command-line-tools}
df -h "$HERE"
printf '\nDevice access\n'; ls -l /dev/kvm /dev/dri 2>&1 || true
printf '\nRuntime\n'; node --version; command -v chromium ffmpeg || true
printf '\nOfficial emulator executable and installed instances\n'
if [ -x "$TOOLS/bin/Emulator" ]; then "$TOOLS/bin/Emulator" -version; "$TOOLS/bin/Emulator" -list -details; else echo 'Set HARMONY_TOOLS_HOME to official command-line-tools directory.'; fi
printf '\nPreviewer library resolution\n'
P="$TOOLS/sdk/default/openharmony/previewer/common/bin"
if [ -f "$P/Previewer" ]; then LD_LIBRARY_PATH="$HERE/compat:$TOOLS/sdk/default/hms/toolchains/lib:$P" ldd "$P/Previewer" | grep -E 'not found|libshared_libz|libhilog' || true; fi
