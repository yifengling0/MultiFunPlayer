#!/bin/bash
set -eu
cd "$(dirname "$0")"
node build-standalone.mjs
node --test smoke.mjs
exec node server.mjs
