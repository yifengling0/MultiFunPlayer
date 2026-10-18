#!/bin/bash
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
TOOLS=${HARMONY_TOOLS_HOME:-$HERE/../harmony-tools-26.0.0.851/command-line-tools}
mkdir -p "$HERE/compat"
ln -sfn "$TOOLS/emulator/libz.so.1.3.2" "$HERE/compat/libshared_libz.so"
export LD_LIBRARY_PATH="$HERE/compat:$TOOLS/sdk/default/hms/toolchains/lib:$TOOLS/sdk/default/openharmony/previewer/common/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$TOOLS/sdk/default/openharmony/previewer/common/bin/Previewer" "$@"
