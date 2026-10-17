import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'mfp-launcher-test-'));
  const sdk = join(base, 'official tools');
  const app = join(base, 'app');
  for (const p of ['tool/node/bin', 'bin', 'hvigor/hvigor/bin', 'hvigor/hvigor-ohos-plugin']) mkdirSync(join(sdk, p), { recursive: true });
  mkdirSync(join(app, 'tools'), { recursive: true });
  mkdirSync(join(base, 'temp'), { recursive: true });
  copyFileSync(fileURLToPath(new URL('../tools/build.sh', import.meta.url)), join(app, 'tools/build.sh'));
  writeFileSync(join(app, 'tools/check_hap.py'), 'import os\nwith open(os.environ["LAUNCH_LOG"], "a") as f: f.write("check-hap\\n")\n');
  writeFileSync(join(sdk, 'hvigor/hvigor/bin/hvigor.js'), '// The actual vendor CLI is mocked only in this launcher unit test.\n');
  const executable = (p, body) => writeFileSync(p, '#!/usr/bin/env bash\nset -eu\n' + body, { mode: 0o755 });
  executable(join(sdk, 'tool/node/bin/node'), 'if [[ "$1" == "--test" ]]; then printf "tests\\n" >> "$LAUNCH_LOG"; else\n  [[ -L "$NODE_PATH/@ohos/hvigor" && -L "$NODE_PATH/@ohos/hvigor-ohos-plugin" ]]\n  printf "direct:%s\\n" "$*" >> "$LAUNCH_LOG"\n  printf "%s" "$NODE_PATH" > "$CACHE_LOG"\nfi\n');
  executable(join(sdk, 'bin/hvigorw'), 'printf "wrapper:%s\\n" "$*" >> "$LAUNCH_LOG"\n');
  const env = { ...process.env, HARMONY_TOOLS_HOME: sdk, LAUNCH_LOG: join(base, 'calls.log'), CACHE_LOG: join(base, 'cache.log'), TMPDIR: join(base, 'temp'), NODE_PATH: '' };
  return { base, sdk, app, env };
}

for (const direct of [false, true]) test(`build launcher keeps official ${direct ? 'direct CLI' : 'wrapper'} route and validation`, () => {
  const f = fixture();
  try {
    const result = spawnSync('bash', [join(f.app, 'tools/build.sh')], { env: { ...f.env, HVIGOR_DIRECT_CLI: direct ? '1' : '0' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(f.env.LAUNCH_LOG, 'utf8');
    assert.match(calls, /^tests\n/);
    assert.match(calls, direct ? /direct:.*hvigor\.js assembleHap/ : /wrapper:assembleHap/);
    assert.match(calls, /--no-daemon --no-parallel/);
    assert.match(calls, /check-hap\n$/);
    if (direct) assert.equal(existsSync(readFileSync(f.env.CACHE_LOG, 'utf8')), false, 'owned temporary module links are removed');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});

test('direct launcher reports a missing vendor CLI rather than falling back or downloading', () => {
  const f = fixture();
  try {
    rmSync(join(f.sdk, 'hvigor/hvigor/bin/hvigor.js'));
    const result = spawnSync('bash', [join(f.app, 'tools/build.sh')], { env: { ...f.env, HVIGOR_DIRECT_CLI: '1' }, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Installed official Hvigor CLI not found/);
    assert.equal(readFileSync(f.env.LAUNCH_LOG, 'utf8'), 'tests\n');
  } finally { rmSync(f.base, { recursive: true, force: true }); }
});
