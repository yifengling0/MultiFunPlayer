import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import fs from 'node:fs';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const { encodeFixed, encodeEvent, formatTCodeValue, asciiBytes, validateTCodeProfile } = await import('../entry/src/main/ets/output/TCodeEncoder.ts');
const { mapFixed, mapEvent, isTCodeDirty, LegacyReferenceProjector, RangeEditor, rangeDiagnostic } = await import('../entry/src/main/ets/output/RangeModel.ts');
const { projectOutputFrame, copyOutputFrame } = await import('../entry/src/main/ets/output/OutputTypes.ts');
const profile = (precision=4, axes=['L0','R0']) => ({precision, revision:1, axisOrder:axes, maximumDurationMs:2147483647,maximumPayloadBytes:1024});
const range = (axisId='L0', minimum=0, maximum=1, enabled=true) => ({axisId,minimum,maximum,enabled});
const event = (targetValue=.5,durationSeconds=.1) => ({eventId:1,epoch:2,sourceFrameSequence:3,axisId:'L0',kind:'script',targetValue,durationSeconds,from:{positionSeconds:0,value:.1},to:{positionSeconds:1,value:.9}});
const code = expected => e => e.code===expected;

test('TCode 0.2/0.3 exact axis order, padding, LF, ASCII, and offloaded intervals',()=>{
  for(const p of [3,4]) {
    const source=[{axisId:'R0',value:1},{axisId:'L0',value:0}];
    assert.equal(encodeFixed(profile(p),source,9.25,false),`L0${'0'.repeat(p)}I10 R0${'9'.repeat(p)}I10\n`);
    assert.equal(encodeFixed(profile(p),source,9.25,true),`L0${'0'.repeat(p)} R0${'9'.repeat(p)}\n`);
    assert.equal(encodeFixed(profile(p),[],0,false),'');
    assert.equal(formatTCodeValue(.5,p),p===3?'500':'5000');
  }
  assert.deepEqual([...asciiBytes('L05000I10\n')],[76,48,53,48,48,48,73,49,48,10]);
  assert.throws(()=>asciiBytes('L0é'),code('invalidValue'));
});
test('event conversion uses original duration seconds exactly once, interval floor(ms+.75)',()=>{
  for(const [ms,integer] of [[0,0],[.24,0],[.25,1],[9.24,9],[9.25,10],[10.5,11]]) {
    assert.equal(encodeFixed(profile(),[{axisId:'L0',value:.5}],ms,false),`L05000I${integer}\n`);
    assert.equal(encodeEvent(profile(),event(.5,ms/1000)),`L05000I${integer}\n`);
  }
});
test('encoder rejects unsupported precision without changing the imported number',()=>{
  for(const precision of [10,0,NaN,Infinity,1.5,11]) {
    const p=profile(precision); assert.throws(()=>validateTCodeProfile(p),code('unsupportedPrecision'));
    assert.equal(p.precision,precision);
  }
});
test('encoder distinguishes malformed axes, duplicate axes, values, durations and payloads',()=>{
  assert.throws(()=>validateTCodeProfile(profile(4,['L00'])),code('invalidAxis'));
  assert.throws(()=>validateTCodeProfile(profile(4,['L0','L0'])),code('duplicateAxis'));
  assert.throws(()=>encodeFixed(profile(),[{axisId:'V0',value:.5}],10,false),code('invalidAxis'));
  assert.throws(()=>encodeFixed(profile(),[{axisId:'L0',value:0},{axisId:'L0',value:1}],10,false),code('duplicateAxis'));
  for(const v of [NaN,Infinity,-Infinity,-.01,1.01]) assert.throws(()=>encodeEvent(profile(),event(v)),code('invalidValue'));
  for(const ms of [NaN,Infinity,-1,2147483648,Number.MAX_SAFE_INTEGER]) assert.throws(()=>encodeFixed(profile(),[],ms,true),code('invalidDuration'));
  assert.throws(()=>encodeEvent({...profile(),maximumPayloadBytes:4},event()),code('oversizePayload'));
});
test('range maps in profile order, never mutates engine inputs, and keeps targets independent',()=>{
  const values=[{axisId:'R0',value:1},{axisId:'L0',value:.25}];
  const a=mapFixed(values,[range('R0',0,.2),range('L0',.2,.6)],profile());
  const b=mapFixed(values,[range('L0',0,1),range('R0',0,1,false)],profile());
  assert.deepEqual(a,[{axisId:'L0',value:.3},{axisId:'R0',value:.2}]);
  assert.deepEqual(b,[{axisId:'L0',value:.25}]); assert.equal(values[1].value,.25);
});
test('range mapping fails closed for missing/invalid enabled axes, ranges and duplicates',()=>{
  for(const values of [[],[{axisId:'L0',value:NaN}],[{axisId:'L0',value:100}]]) assert.throws(()=>mapFixed(values,[range()],profile(4,['L0'])),code('invalidValue'));
  for(const r of [range('L0',1.01,.2),range('L0',.8,-.01),range('L0',NaN,1),range('L0',-1,1),range('L0',0,Infinity)]) assert.throws(()=>mapFixed([{axisId:'L0',value:0}],[r],profile(4,['L0'])),code('invalidRange'));
  assert.throws(()=>mapFixed([{axisId:'L0',value:0}],[range(),range()],profile(4,['L0'])),code('duplicateAxis'));
  assert.deepEqual(mapFixed([], [range('L0',0,1,false)],profile(4,['L0'])),[]);
  assert.equal(rangeDiagnostic(range('L0',.5,.5)).startsWith('degenerateRange'),true);
});
test('mapped events preserve target/duration/keyframes and disabled events produce no command',()=>{
  const original=event(.2,.25), mapped=mapEvent(original,range('L0',.25,.75),profile());
  assert.equal(mapped.targetValue,.35); assert.equal(mapped.durationSeconds,.25);
  assert.deepEqual(mapped.from,original.from); assert.equal(original.targetValue,.2);
  assert.equal(mapEvent(original,range('L0',0,1,false),profile()),null);
  assert.throws(()=>mapEvent(event(NaN),range(),profile()),code('invalidValue'));
  assert.throws(()=>mapEvent(event(.5,-1),range(),profile()),code('invalidDuration'));
});
test('dirty compares raw mapped doubles, including finite XOR and threshold boundaries',()=>{
  for(const p of [3,4]) {
    const unit=10**-p;
    assert.equal(isTCodeDirty(unit,0,p),true); assert.equal(isTCodeDirty(unit*.999,0,p),false);
    assert.equal(isTCodeDirty(NaN,0,p),true); assert.equal(isTCodeDirty(0,NaN,p),true);
    assert.equal(isTCodeDirty(NaN,Infinity,p),false); assert.equal(isTCodeDirty(.5,.5,p),false);
    const low=.5-unit*.1, high=.5+unit*.1;
    assert.notEqual(formatTCodeValue(low,p),formatTCodeValue(high,p));
    assert.equal(isTCodeDirty(low,high,p),false);
  }
});
test('LegacyReferenceProjector explicitly captures original nonfinite fallback, production rejects it',()=>{
  for(const invalid of [NaN,Infinity,-Infinity]) {
    assert.equal(LegacyReferenceProjector.fixedValue(invalid,.5),.5);
    assert.equal(LegacyReferenceProjector.polledTarget(invalid),null);
    assert.throws(()=>mapFixed([{axisId:'L0',value:invalid}],[range()],profile(4,['L0'])),code('invalidValue'));
  }
  assert.equal(LegacyReferenceProjector.fixedValue(.2,.5),.2);
});
test('range minimum/maximum/middle/size offsets preserve source edit rules',()=>{
  const r=range('L0',.2,.8);
  assert.deepEqual(RangeEditor.setMinimum(r,1),range('L0',.79,.8));
  assert.deepEqual(RangeEditor.setMaximum(r,0),range('L0',.2,.21000000000000002));
  assert.equal(RangeEditor.setMiddle(r,1).maximum,1);
  assert.equal(RangeEditor.offsetMiddle(r,-1).minimum,0);
  assert.equal(RangeEditor.setSize(r,2).minimum,0);
  assert.equal(RangeEditor.offsetSize(r,-2).maximum-RangeEditor.offsetSize(r,-2).minimum,.010000000000000009);
  assert.equal(r.minimum,.2);
});
test('completed frame projection preserves identity and genuine event targets without using deltaSeconds',()=>{
  const source={sequence:5,epoch:7,profileRevision:9,monotonicMs:10,mediaPositionMs:20,deltaSeconds:999,
    axisStates:[{axisName:'L0',value:.4},{axisName:'R0',value:1.2}],events:[{...event(.9,.125),eventId:12,epoch:7,sourceFrameSequence:5,axisName:'L0',speedLimitUnitsPerSecond:null}]};
  const projected=projectOutputFrame(source);
  assert.deepEqual(projected.values,[{axisId:'L0',value:.4},{axisId:'R0',value:1}]);
  assert.equal(projected.events[0].targetValue,.9); assert.equal(projected.events[0].durationSeconds,.125);
  assert.equal(projected.epoch,7); assert.equal(projected.profileRevision,9); assert.equal('deltaSeconds' in projected,false);
  source.axisStates[0].value=0; source.events[0].targetValue=0; assert.equal(projected.values[0].value,.4); assert.equal(projected.events[0].targetValue,.9);
  const detached=copyOutputFrame(projected);detached.values[0].value=.99;detached.events[0].from.value=.99;
  assert.equal(projected.values[0].value,.4);assert.equal(projected.events[0].from.value,.1);
});
test('output package has no native I/O, preview, UI, timer or wall-clock dependency',()=>{
  const dir=new URL('../entry/src/main/ets/output/',import.meta.url);
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const source=fs.readFileSync(new URL(entry.name,dir),'utf8');
    assert.doesNotMatch(source,/from\s+['"](?:@kit|@ohos|node:|.*PlaybackEngine|.*\/ui\/|.*\/components\/)/);
    assert.doesNotMatch(source,/(?:Date\.now|setTimeout|setInterval|fetch\s*\()/);
  }
});
