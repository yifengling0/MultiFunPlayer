#!/usr/bin/env bash
set -euo pipefail
# HARMONY_TOOLS_HOME must point to an already installed official command-line-tools directory.
: "${HARMONY_TOOLS_HOME:?Set HARMONY_TOOLS_HOME to your official HarmonyOS command-line-tools installation}"
export DEVECO_HOME="$HARMONY_TOOLS_HOME"
export DEVECO_SDK_HOME="$HARMONY_TOOLS_HOME/sdk"
export DEVECO_NODE_HOME="$HARMONY_TOOLS_HOME/tool/node"
export PATH="$DEVECO_NODE_HOME/bin:$HARMONY_TOOLS_HOME/bin:$PATH"
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon --no-parallel --optimization-strategy memory --max-old-space-size 512
python3 tools/check_hap.py entry/build/default/outputs/default/entry-default-unsigned.hap
