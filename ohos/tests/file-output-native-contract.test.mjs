import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../entry/src/main/ets/output/recording/NativeRecordingRoot.ets',import.meta.url),'utf8');
test('native recording adapter accepts only system Download capability and secure native namespace creation',()=>{assert.match(source,/private constructor/);assert.match(source,/DownloadLibrary.prepare\(context\)/);assert.match(source,/native.prepareRoot\(directory.path\)/);assert.doesNotMatch(source,/fileIo\.(mkdir|open|write|rename|unlink)\(/);assert.doesNotMatch(source,/\.select\(/);assert.match(source,/native.create\(this.path, name\)/);});
test('native publication failure retains actual published list and never labels complete',()=>{assert.match(source,/RecordingPublicationError/);assert.match(source,/=== '117'/);assert.match(source,/native.finalize\(file.token\)/);assert.match(source,/native.abort\(file.token\)/);assert.match(source,/candidate === file/);});
