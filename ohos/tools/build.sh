#!/usr/bin/env bash
set -euo pipefail
# HARMONY_TOOLS_HOME must point to an already installed official command-line-tools directory.
: "${HARMONY_TOOLS_HOME:?Set HARMONY_TOOLS_HOME to your official HarmonyOS command-line-tools installation}"
# Bound Java packaging memory as well as the ArkTS worker heap. Caller may override.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx256m}"
export DEVECO_HOME="$HARMONY_TOOLS_HOME"
export DEVECO_SDK_HOME="$HARMONY_TOOLS_HOME/sdk"
export DEVECO_NODE_HOME="$HARMONY_TOOLS_HOME/tool/node"
export PATH="$DEVECO_NODE_HOME/bin:$HARMONY_TOOLS_HOME/bin:$PATH"
cd "$(dirname "$0")/.."
node --test tests/*.test.mjs
# Keep the normal wrapper by default. Constrained runners may use the same
# installed vendor CLI directly, with HOME/HVIGOR_USER_HOME set to writable paths.
hvigor_args=(assembleHap --mode module -p product=default -p buildMode=debug --no-daemon --no-parallel --optimization-strategy memory --max-old-space-size 512)
if [[ "${HVIGOR_DIRECT_CLI:-0}" == "1" ]]; then
  hvigor_cli="$HARMONY_TOOLS_HOME/hvigor/hvigor/bin/hvigor.js"
  if [[ ! -f "$hvigor_cli" ]]; then
    printf 'Installed official Hvigor CLI not found: %s\n' "$hvigor_cli" >&2
    exit 1
  fi
  # Resolve the already-installed vendor packages without writing into the SDK
  # or relying on the wrapper's global cache. Never replace caller-owned files.
  vendor_modules="$(mktemp -d "${TMPDIR:-/tmp}/mfp-hvigor-modules.XXXXXX")"
  trap 'rm -rf -- "$vendor_modules"' EXIT
  mkdir -p "$vendor_modules/@ohos"
  for package in hvigor hvigor-ohos-plugin; do
    if [[ ! -d "$HARMONY_TOOLS_HOME/hvigor/$package" ]]; then
      printf 'Installed vendor package not found: %s\n' "$package" >&2
      exit 1
    fi
    ln -s "$HARMONY_TOOLS_HOME/hvigor/$package" "$vendor_modules/@ohos/$package"
  done
  export NODE_PATH="$vendor_modules${NODE_PATH:+:$NODE_PATH}"
  "$DEVECO_NODE_HOME/bin/node" "$hvigor_cli" "${hvigor_args[@]}"
else
  hvigorw "${hvigor_args[@]}"
fi
python3 tools/check_hap.py entry/build/default/outputs/default/entry-default-unsigned.hap
