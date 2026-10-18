import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes,registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {PlaybackSessionCore}=await import('../entry/src/main/ets/core/PlaybackSessionCore.ts');
const {SettingsStore}=await import('../entry/src/main/ets/settings/SettingsStore.ts');
const {SettingsSchema}=await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const source=readFileSync(new URL('../entry/src/main/ets/app/PlaybackSession.ets',import.meta.url),'utf8');
function setup(primary=null,backup=null){let reads=0,writes=[];let release=null;const port={async read(slot){reads++;if(release)await release;if(primary instanceof Error)throw primary;return slot==='primary'?primary:backup;},async writeAtomic(json,previous){writes.push({json,previous});}};let stores=[];class NativeSettingsStore extends SettingsStore {constructor(filesDir){super(port,0);this.filesDir=filesDir;stores.push(this);}}const code=source.replace(/^import .*;\n/gm,'').replace('export class PlaybackSession','class PlaybackSession');const Session=new Function('PlaybackSessionCore','NativeSettingsStore',stripTypeScriptTypes(code)+'; return PlaybackSession;')(PlaybackSessionCore,NativeSettingsStore);return{Session,stores,writes,get reads(){return reads},block(p){release=p}};}
test('cold initialization waits for native load and shares a single writer across repeated calls',async()=>{const h=setup();let release;h.block(new Promise(r=>release=r));assert.throws(()=>h.Session.current(),/must load/);const first=h.Session.initialize('/sandbox/files'),second=h.Session.initialize('/sandbox/files');assert.equal(first,second);assert.equal(h.stores.length,1);assert.throws(()=>h.Session.current());release();const s=await first;assert.equal(h.Session.current(),s);assert.equal(h.writes.length,0);assert.equal(s.activeRegistry().profile.id,'TCode-0.3');assert.equal(s.snapshot().safetyGateOpen,false);});
test('future schema preserves files, displays readOnly and rejects edits without writes',async()=>{const h=setup('{"schemaVersion":999}');const s=await h.Session.initialize('/sandbox/files');assert.equal(s.settingsStatus().readOnly,true);assert.match(s.settingsMessage(),/只读.*保留/);assert.throws(()=>s.setGlobalOffset(100),/只读/);assert.throws(()=>s.acceptSettingsRecovery());assert.equal(h.writes.length,0);});
test('corrupt primary requires visible explicit recovery acceptance before any persistence',async()=>{const cfg=SettingsSchema.defaults();cfg.globalOffsetSeconds=.2;const h=setup('{broken',SettingsSchema.encode(cfg));const s=await h.Session.initialize('/sandbox/files');assert.equal(s.settingsStatus().recoveryRequired,true);assert.match(s.settingsMessage(),/恢复需要确认.*backup/);assert.equal(s.configurationSnapshot().globalOffsetSeconds,.2);assert.equal(h.writes.length,0);assert.throws(()=>s.setGlobalOffset(500),/恢复/);s.acceptSettingsRecovery();await h.stores[0].flush();assert.equal(s.settingsStatus().recoveryRequired,false);assert.equal(h.writes.length,1);assert.equal(JSON.parse(h.writes[0].json).globalOffsetSeconds,.2);});
test('live axis and motion settings persist and reload while runtime/arming never persist',async()=>{const h=setup();const s=await h.Session.initialize('/sandbox/files');let axis=s.getAxisConfiguration('L0');axis.scriptScale=1.7;s.changeAxisConfiguration('L0',axis);let motion=s.getMotionConfiguration('R0','Pattern');motion.speed=2;s.changeMotionConfiguration('R0',motion);s.setConnected(true);await h.stores[0].flush();const json=h.writes.at(-1).json;assert.equal(json.includes('armed'),false);assert.equal(json.includes('nativeGate'),false);const reboot=setup(json);const r=await reboot.Session.initialize('/sandbox/files');assert.equal(r.getAxisConfiguration('L0').scriptScale,1.7);assert.equal(r.getMotionConfiguration('R0','Pattern').speed,2);assert.equal(r.snapshot().safetyGateOpen,false);});
test('native permission failure becomes a genuine readOnly error and never successful empty settings',async()=>{const h=setup(new Error('permission denied'));const s=await h.Session.initialize('/sandbox/files');assert.equal(s.settingsStatus().readOnly,true);assert.match(s.settingsMessage(),/permission denied/);assert.equal(h.writes.length,0);});


test('import profile uses the same readOnly gate and persists without selecting it',async()=>{
  const profile=SettingsSchema.defaults().devices[0];profile.id='clipboard-import';profile.isBuiltIn=false;profile.name='Clipboard custom';
  const ro=setup('{"schemaVersion":999}');const blocked=await ro.Session.initialize('/sandbox/files');
  assert.throws(()=>blocked.importProfile(profile),/只读/);assert.equal(ro.writes.length,0);
  const h=setup();const s=await h.Session.initialize('/sandbox/files');s.importProfile(profile);await h.stores[0].flush();
  const json=h.writes.at(-1).json;const reboot=setup(json);const r=await reboot.Session.initialize('/sandbox/files');
  assert.equal(r.configurationSnapshot().selectedDeviceId,'TCode-0.3');assert.ok(r.configurationSnapshot().devices.some(p=>p.id==='clipboard-import'));
});

test('playlist and AutoSkip preferences survive guarded native store reload while AB/source/seek/output state do not',async()=>{
 const h=setup(),s=await h.Session.initialize('/sandbox/files');const playback=s.playbackConfiguration();
 playback.playlistAssociations=['folder/a.funscript','b.funscript','folder/a.funscript'];playback.internalAutoConnect=true;playback.loadAdditionalScripts=true;playback.internalShuffling=true;playback.autoSkipEnabled=false;playback.autoSkipOffsetSeconds=-2.5;
 s.changePlaybackConfiguration(playback);s.mediaLoop.setLoop(1,3,10);s.setConnected(true);await h.stores[0].flush();
 const json=h.writes.at(-1).json;for(const forbidden of ['startPosition','endPosition','seekTransition','sourceGeneration','armed','isPlaying'])assert.equal(json.includes(forbidden),false,forbidden);
 const reboot=setup(json),r=await reboot.Session.initialize('/sandbox/files');assert.deepEqual(r.playbackConfiguration(),playback);assert.equal(r.mediaLoop.isValid,false);assert.equal(r.autoSkip.pending,false);assert.equal(r.snapshot().state,'stopped');assert.equal(r.snapshot().safetyGateOpen,false);
 const ro=setup('{"schemaVersion":999}'),blocked=await ro.Session.initialize('/sandbox/files');assert.throws(()=>blocked.changePlaybackConfiguration(playback),/只读/);assert.equal(ro.writes.length,0);
});
