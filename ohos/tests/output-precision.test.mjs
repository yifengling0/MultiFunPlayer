import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {formatTCodeValue,validateTCodeProfile,encodeFixed,encodeEvent}=await import('../entry/src/main/ets/output/TCodeEncoder.ts');
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/output-precision-csharp.json',import.meta.url),'utf8'));
const profile=precision=>({precision,revision:1,axisOrder:['L0'],maximumDurationMs:1000,maximumPayloadBytes:128});
const event=value=>({eventId:1,epoch:1,sourceFrameSequence:1,axisId:'L0',kind:'script',targetValue:value,durationSeconds:.01});

test('all custom precisions 1–9 match executed original C# including rounding boundary neighbors',()=>{
  assert.equal(fixture.provenance.executedCSharp,true);
  assert.equal(fixture.provenance.runtime,'9.0.21 linux-x64');
  assert.equal(fixture.provenance.sourceCommit,'36c08fbb99ac9398a63ff1cca1bbf68cd2228a94');
  for(const family of fixture.families.filter(f=>f.precision<=9)){
    assert.equal(family.maximum,10**family.precision-1);
    assert.ok(family.rows.length>1200);
    validateTCodeProfile(profile(family.precision));
    for(const [value,expected] of family.rows){
      assert.equal('L0'+formatTCodeValue(value,family.precision),expected,`precision=${family.precision}, value=${value}`);
    }
  }
});
test('custom precision survives fixed/event encoding with exact padding and payload bounds',()=>{
  for(let p=1;p<=9;p++){
    const zero='0'.repeat(p),maximum='9'.repeat(p);
    assert.equal(encodeFixed(profile(p),[{axisId:'L0',value:0}],10,false),`L0${zero}I10\n`);
    assert.equal(encodeFixed(profile(p),[{axisId:'L0',value:1}],10,true),`L0${maximum}\n`);
    assert.equal(encodeEvent(profile(p),event(1)),`L0${maximum}I10\n`);
    assert.equal(formatTCodeValue(-0,p),zero);
    assert.throws(()=>encodeFixed({...profile(p),maximumPayloadBytes:p+2},[{axisId:'L0',value:1}],0,true),e=>e.code==='oversizePayload');
    for(const value of [NaN,Infinity,-Infinity,-Number.MIN_VALUE,1+Number.EPSILON]){
      assert.throws(()=>formatTCodeValue(value,p),e=>e.code==='invalidValue');
      assert.throws(()=>encodeEvent(profile(p),event(value)),e=>e.code==='invalidValue');
    }
  }
});
test('precision 10 retains source defect evidence but is not silently given different semantics',()=>{
  const family=fixture.families.find(f=>f.precision===10);
  assert.equal(family.maximum,2147483647);
  assert.equal(family.dirtyUnit,false); // source maximum+1 overflows Int32
  assert.deepEqual(family.rows.find(([value])=>value===1),[1,'L02147483647']);
  const p=profile(10);
  for(const operation of [()=>validateTCodeProfile(p),()=>formatTCodeValue(.5,10),()=>encodeEvent(p,event(.5))]){
    assert.throws(operation,e=>e.code==='unsupportedPrecision'&&e.message.includes('source defect'));
  }
  assert.equal(p.precision,10);
});
test('malformed precision is rejected without integer truncation or string coercion',()=>{
  for(const p of [0,-1,1.5,9.1,11,NaN,Infinity,-Infinity,'3',null,undefined]){
    assert.throws(()=>formatTCodeValue(.5,p),e=>e.code==='unsupportedPrecision');
    assert.throws(()=>validateTCodeProfile(profile(p)),e=>e.code==='unsupportedPrecision');
  }
});

// Optional live differential replay, never downloads an SDK or runs a device.
// MFP_DOTNET_ROOT=/path/to/official/net9-sdk node --experimental-strip-types --test ohos/tests/output-precision.test.mjs
// First prepare the repository's source-verified oracle with tools/reference/compile.py.
test('optional source-oracle replay of every saved precision row', {skip:!process.env.MFP_DOTNET_ROOT}, async()=>{
  const {execFileSync}=await import('node:child_process');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {fileURLToPath}=await import('node:url');
  const directory=fs.mkdtempSync(join(tmpdir(),'mfp-precision-'));
  try {
    for(const family of fixture.families){
      const input=join(directory,`precision-${family.precision}.json`);
      fs.writeFileSync(input,JSON.stringify(family.rows.map(([value])=>value)));
      const result=JSON.parse(execFileSync('python3',[fileURLToPath(new URL('../tools/reference/run.py',import.meta.url)),'tcode',String(family.precision),input],{encoding:'utf8',maxBuffer:16*1024*1024}));
      assert.equal(result.maximum,family.maximum);
      assert.equal(result.dirtyUnit,family.dirtyUnit);
      assert.deepEqual(result.rows.slice(-family.rows.length).map(row=>[row.value,row.encoded]),family.rows);
    }
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
