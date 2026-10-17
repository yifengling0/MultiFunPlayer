import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {recordingHeader,recordingRow,recordingFooter}=await import('../entry/src/main/ets/output/recording/RecordingCodec.ts');
const golden=JSON.parse(fs.readFileSync(new URL('./fixtures/file-output-csharp.json',import.meta.url)));
test('unmodified C# writer fixtures: exact bytes, bankers rounding, float percentage and invariant CSV',()=>{
 assert.equal(golden.provenance.executedOriginalCSharp,true);
 const source=fs.readFileSync(new URL('../../Source/MultiFunPlayer/Script/IScriptWriter.cs',import.meta.url));
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),golden.provenance.sha256);
 for(const row of golden.rows)for(const format of ['csv','funscript']){
  assert.equal(recordingHeader(format)+recordingRow(format,row.seconds,row.value,true)+recordingFooter(format),row[format],JSON.stringify(row));
  assert.notEqual(row.bom,'77u/');
 }
});
