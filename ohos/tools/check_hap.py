#!/usr/bin/env python3
"""Check packaging only; never claims signing, installability, or device validation."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path
p = Path(sys.argv[1])
with zipfile.ZipFile(p) as z:
    assert z.testzip() is None, 'Corrupt HAP'
    assert 'ets/modules.abc' in z.namelist(), 'Missing compiled ArkTS'
    assert z.getinfo('ets/modules.abc').file_size > 0
    assert 'module.json' in z.namelist(), 'Missing module metadata'
    metadata = json.loads(z.read('module.json'))
    assert metadata['app']['bundleName'] == 'com.multifunplayer.ohos'
    assert set(metadata['module']['deviceTypes']) == {'phone', 'tablet', '2in1'}
print('Unsigned HAP packaging verified:', p.name, p.stat().st_size, 'bytes')
print('SHA256:', hashlib.sha256(p.read_bytes()).hexdigest())
print('No signing, installation, device UI, or physical output test performed.')
