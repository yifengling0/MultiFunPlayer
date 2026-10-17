#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
build="$(mktemp -d /tmp/mfp-recording-build-XXXXXX)"
trap 'rm -rf "$build"' EXIT
"${CXX:-g++}" -std=c++17 -Wall -Wextra -Werror -pthread \
  -I"$root/entry/src/main/cpp" "$root/entry/src/main/cpp/recording_store.cpp" \
  "$root/tests/native/recording_store_test.cpp" \
  -Wl,--wrap=write -Wl,--wrap=close -Wl,--wrap=fsync -o "$build/recording-test"
"$build/recording-test"
# Optional official OHOS SDK cross-build; this is not a device runtime test.
if [[ -n "${OHOS_NATIVE_SDK:-}" ]]; then
  export PATH="$OHOS_NATIVE_SDK/build-tools/cmake/bin:$PATH"
  for abi in arm64-v8a x86_64; do
    cmake -G Ninja -S "$root/entry/src/main/cpp" -B "$build/$abi" \
      -DCMAKE_TOOLCHAIN_FILE="$OHOS_NATIVE_SDK/build/cmake/ohos.toolchain.cmake" \
      -DOHOS_ARCH="$abi" -DOHOS_PLATFORM=OHOS -DCMAKE_BUILD_TYPE=Release
    cmake --build "$build/$abi" --parallel 2
  done
fi
