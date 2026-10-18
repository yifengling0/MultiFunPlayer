#!/usr/bin/env python3
"""Capture vendor-generated builder for structural/event tests, not a rendered UI oracle.
Run only after the whole-app official SDK build; the fixture pins the builder source.
"""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
source=(root/'entry/src/main/ets/pages/Index.ets').read_text()
compiled=root/'entry/build/default/cache/default/default@CompileArkTS/esmodule/debug/entry/src/main/ets/pages/Index.ts'
s=compiled.read_text();a=s.index('    videoStage(parent = null) {');b=s.index('    workspaceSettings(parent = null) {',a)
a_src=source.index('  videoStage() {');b_src=source.index('  @Builder\n  workspaceSettings()',a_src)
fixture={'sourceBuilderSha256':hashlib.sha256(source[a_src:b_src].encode()).hexdigest(),'sdk':'26.0.0.105','boundary':'Actual SDK-transformed builder with recording ArkUI doubles; not native rendering or hit-test proof.','method':s[a:b]}
(root/'tests/fixtures/video-stage-031-sdk.json').write_text(json.dumps(fixture,ensure_ascii=False,indent=2)+'\n')
