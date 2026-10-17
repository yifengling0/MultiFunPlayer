import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? specifier + '.ts' : specifier, context);
} });
const { DeviceProfileTransfer: codec, DeviceProfileClipboard } = await import('../entry/src/main/ets/core/DeviceProfileTransfer.ts');
const { DeviceProfiles } = await import('../entry/src/main/ets/core/DeviceProfile.ts');
const golden = readFileSync(new URL('./fixtures/device-profile-transfer/source-custom.json', import.meta.url), 'utf8');
const builtIns = DeviceProfiles.builtInProfiles();
test('source-format golden preserves all fields, order, disabled axes and exact aliases', () => {
  const profile = codec.decode(golden, builtIns);
  assert.equal(profile.id, 'custom-1'); assert.equal(profile.isBuiltIn, false);
  assert.equal(codec.encode(profile) + '\n', golden);
  assert.deepEqual(codec.decode(codec.encode(profile), builtIns), profile);
  assert.deepEqual(profile.axes.map(a => a.enabled), [true, false]);
});
test('source defaults and IsDefault removal; unknown values are ignored without assigning', () => {
  const raw = {Name:'TCode-0.3', IsDefault:true, id:'TCode-0.3', isBuiltIn:true, selectedDeviceId:'other', Axes:[{Name:'Z9'}]};
  const profile = codec.decode(JSON.stringify(raw), [...builtIns, codec.decode(golden, builtIns)]);
  assert.equal(profile.id, 'custom-2'); assert.equal(profile.isBuiltIn, false);
  assert.equal(profile.outputPrecision, 3);
  assert.deepEqual([profile.axes[0].friendlyName, profile.axes[0].funscriptNames, profile.axes[0].enabled, profile.axes[0].defaultValue], [null, [], false, 0]);
  assert.deepEqual(builtIns, DeviceProfiles.builtInProfiles());
  assert.equal('IsDefault' in JSON.parse(codec.encode(profile)), false);
});
test('malformed and unsafe JSON is rejected even in unknown nested fields', () => {
  for (const text of ['', ' ', 'null', '[]', '{', '{"Name":"x","unknown":{"__proto__":{}}}', '{"Name":"x","constructor":{}}', '{"Name":"x","$type":"evil"}']) {
    assert.throws(() => codec.decode(text, builtIns));
  }
  for (const patch of [{Name:''}, {OutputPrecision:0}, {OutputPrecision:11}, {OutputPrecision:2.5}, {Axes:null}, {Axes:[null]},
    {Axes:[{Name:'l0'}]}, {Axes:[{Name:'L0'},{Name:'L0'}]}, {Axes:[{Name:'L0',Enabled:1}]},
    {Axes:[{Name:'L0',DefaultValue:2}]}, {Axes:[{Name:'L0',DefaultValue:null}]}, {Axes:[{Name:'L0',FunscriptNames:['']}]}]) {
    assert.throws(() => codec.decode(JSON.stringify({...JSON.parse(golden), ...patch}), builtIns));
  }
  assert.throws(() => codec.decode('{"Name":"x","OutputPrecision":1e999}', builtIns));
});
test('budgets for text, depth, axes, aliases and strings reject oversized inputs', () => {
  for (const value of [{Name:'x'.repeat(257)}, {Name:'x',Axes:Array.from({length:33},(_,i)=>({Name:'A'+i}))},
    {Name:'x',Axes:[{Name:'L0',FunscriptNames:Array(65).fill('a')}]}, {Name:'x',unused:Array(257).fill(0)}]) {
    assert.throws(() => codec.decode(JSON.stringify(value), builtIns));
  }
  assert.throws(() => codec.decode(' '.repeat(65537), builtIns));
  let nested = 0; for (let i=0;i<18;i++) nested={n:nested};
  assert.throws(() => codec.decode(JSON.stringify({Name:'x',nested}), builtIns));
});
test('fake clipboard port performs no startup reads, roundtrips and propagates errors', async () => {
  let reads=0, writes=0, content=golden;
  const clipboard = new DeviceProfileClipboard({async readText(){reads++;return content;},async writeText(text){writes++;content=text;}});
  assert.deepEqual([reads,writes],[0,0]);
  const profile=await clipboard.importProfile(builtIns); assert.deepEqual([reads,writes],[1,0]);
  await clipboard.exportProfile(profile); assert.deepEqual([reads,writes],[1,1]);
  assert.deepEqual(await clipboard.importProfile(builtIns),profile);
  const failure = new DeviceProfileClipboard({async readText(){throw new Error('permission/cancel');},async writeText(){throw new Error('busy');}});
  await assert.rejects(failure.importProfile(builtIns), /permission\/cancel/);
  await assert.rejects(failure.exportProfile(profile), /busy/);
  content='';await assert.rejects(clipboard.importProfile(builtIns), /JSON/);
});
test('UI restricts read to successful explicit secure paste, exposes cancellation and clipboard replacement', () => {
  const ui=readFileSync(new URL('../entry/src/main/ets/components/DeviceSettingsPanel.ets',import.meta.url),'utf8');
  assert.match(ui,/PasteButton\(/);assert.match(ui,/result === PasteButtonOnClickResult.SUCCESS/);
  assert.match(ui,/this.readOnly \|\| this.transferBusy/);assert.match(ui,/确认复制并替换/);
  assert.equal((ui.match(/\.importProfile\(this.profiles\)/g)||[]).length,1);
  const startup = ui.match(/aboutToAppear\(\): void \{([^}]*)\}/);
  assert.ok(startup, 'device panel startup lifecycle exists');
  assert.doesNotMatch(startup[1], /clipboard|importProfile|readText|getData/i, 'startup only manages editor focus; clipboard import requires explicit secure paste');
});
test('native adapter uses official text MIME API with injected fake pasteboard, never real clipboard', async () => {
  const { stripTypeScriptTypes } = await import('node:module');
  let reads=0, writes=0, content='source', failure=null;
  const board={async getData(){reads++;if(failure)throw failure;return {getPrimaryText(){return content;}};},
    async setData(data){writes++;if(failure)throw failure;assert.equal(data.mime,'text/plain');content=data.value;}};
  globalThis.__mfpFakePasteboard={getSystemPasteboard(){return board;},MIMETYPE_TEXT_PLAIN:'text/plain',createData(mime,value){return {mime,value};}};
  try {
    const source=readFileSync(new URL('../entry/src/main/ets/settings/NativeDeviceClipboard.ets',import.meta.url),'utf8')
      .replace("import { pasteboard } from '@kit.BasicServicesKit';",'const pasteboard = globalThis.__mfpFakePasteboard;')
      .replace("import { DeviceClipboardPort } from '../core/DeviceProfileTransfer';",'');
    const js=stripTypeScriptTypes(source);
    const {NativeDeviceClipboard}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
    const adapter=new NativeDeviceClipboard();assert.deepEqual([reads,writes],[0,0]);
    assert.equal(await adapter.readText(),'source');await adapter.writeText(golden);assert.equal(content,golden);
    failure=new Error('201 permission denied');await assert.rejects(adapter.readText(),/201/);
    failure=new Error('27787277 operation busy');await assert.rejects(adapter.writeText(golden),/27787277/);
  } finally { delete globalThis.__mfpFakePasteboard; }
});
