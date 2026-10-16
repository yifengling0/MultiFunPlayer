import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s+'.ts' : s,c); } });
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');
const encode = offset => { const c = SettingsSchema.defaults(); c.globalOffsetSeconds = offset; return SettingsSchema.encode(c); };
const config = offset => SettingsSchema.decode(encode(offset)).configuration;
const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
class Port {
  primary = null; backup = null; reads=[]; writes=[]; failRead=null; failWrite=false; gate=null; active=0; maximumActive=0;
  async read(slot) { this.reads.push(slot); if (slot===this.failRead) throw new Error('Permission denied (13900012)'); return this[slot]; }
  async writeAtomic(json, previous) {
    this.active++; this.maximumActive=Math.max(this.maximumActive,this.active); this.writes.push({json, previous});
    try { if(this.gate) { const gate=this.gate; this.gate=null; await gate.promise; } if(this.failWrite) throw new Error('Disk full');
      if(previous!==null) this.backup=previous; this.primary=json;
    } finally { this.active--; }
  }
}

test('first run and valid loads never write, load snapshots are isolated, load races deduplicate', async () => {
  const port=new Port(); const store=new SettingsStore(port,0);
  const [a,b]=await Promise.all([store.load(),store.load()]);
  assert.equal(a.source,'defaults'); assert.equal(a.recoveryRequired,false); assert.equal(port.writes.length,0);
  assert.deepEqual(port.reads,['primary','backup']); a.configuration.globalOffsetSeconds=99;
  assert.equal(b.configuration.globalOffsetSeconds,0); assert.equal(store.snapshot().globalOffsetSeconds,0);
});

test('corrupt primary recovers backup without mutation and requires explicit acceptance', async () => {
  const port=new Port(); port.primary='{corrupt'; port.backup=encode(3); const store=new SettingsStore(port,0);
  const result=await store.load(); assert.equal(result.source,'backup'); assert.equal(result.configuration.globalOffsetSeconds,3);
  assert.equal(result.recoveryRequired,true); assert.equal(port.primary,'{corrupt'); assert.equal(port.writes.length,0);
  assert.equal((await store.save(config(4))).status,'blocked'); store.acceptRecovery();
  assert.equal((await store.save(config(4))).status,'saved'); assert.equal(SettingsSchema.decode(port.backup).configuration.globalOffsetSeconds,3);
  assert.ok(result.diagnostics.some(d=>d.code==='backup_recovered'));
});

test('both corrupted files use defaults without writes; unknown schema forbids replacement and fallback', async () => {
  const port=new Port(); port.primary='bad'; port.backup='bad'; const store=new SettingsStore(port,0);
  const result=await store.load(); assert.equal(result.source,'defaults'); assert.equal(result.recoveryRequired,true); assert.equal(port.writes.length,0);
  const newer=new Port(); newer.primary='{"schemaVersion":12,"future":"preserve"}'; newer.backup=encode(2);
  const locked=new SettingsStore(newer,0); const loaded=await locked.load(); assert.equal(loaded.readOnly,true);
  assert.deepEqual(newer.reads,['primary']); assert.equal((await locked.save(config(0))).status,'blocked');
  assert.throws(()=>locked.acceptRecovery()); assert.match(newer.primary,/preserve/);
});

test('permission failure is not treated as a missing file and remains visible/read-only', async () => {
  const port=new Port(); port.failRead='primary'; const store=new SettingsStore(port,0); const result=await store.load();
  assert.equal(result.readOnly,true); assert.match(store.status().lastError,/Permission denied/); assert.deepEqual(port.reads,['primary']);
  assert.equal((await store.save(config(1))).status,'blocked'); assert.equal(port.writes.length,0);
});

test('debounce coalesces revisions, captures immutable snapshots, flush forces persistence', async () => {
  const port=new Port(); const store=new SettingsStore(port,10000); await store.load();
  const a=config(1); const p1=store.save(a); a.globalOffsetSeconds=999; const p2=store.save(config(2));
  assert.equal(port.writes.length,0); const flushing=store.flush(); const [r1,r2]=await Promise.all([p1,p2]); await flushing;
  assert.equal(r1.status,'superseded'); assert.equal(r2.status,'saved'); assert.equal(port.writes.length,1);
  assert.equal(SettingsSchema.decode(port.primary).configuration.globalOffsetSeconds,2); assert.equal(store.status().dirty,false);
});

test('slow old writes cannot overwrite newer revisions; exactly one writer and correct backup lineage', async () => {
  const port=new Port(); const store=new SettingsStore(port,0); await store.load(); const gate=deferred(); port.gate=gate;
  const p1=store.save(config(1)); const flushing=store.flush(); await Promise.resolve();
  const p2=store.save(config(2)); const p3=store.save(config(3)); gate.resolve();
  const results=await Promise.all([p1,p2,p3]); await flushing;
  assert.equal(port.maximumActive,1); assert.equal(port.writes.length,2);
  assert.deepEqual(results.map(r=>r.status),['saved','superseded','saved']);
  assert.equal(SettingsSchema.decode(port.primary).configuration.globalOffsetSeconds,3);
  assert.equal(SettingsSchema.decode(port.backup).configuration.globalOffsetSeconds,1);
  assert.equal(store.status().savedRevision,3); assert.equal(store.status().dirty,false);
});

test('failure remains dirty and retry saves latest intent without backing up a corrupt or failed write', async () => {
  const port=new Port(); port.primary=encode(1); const store=new SettingsStore(port,0); await store.load();
  port.failWrite=true; const result=await store.save(config(2)); assert.equal(result.status,'failed');
  assert.equal(store.status().dirty,true); assert.match(store.status().lastError,/Disk full/);
  assert.equal(SettingsSchema.decode(port.primary).configuration.globalOffsetSeconds,1);
  port.failWrite=false; assert.equal((await store.retry()).status,'saved');
  assert.equal(SettingsSchema.decode(port.primary).configuration.globalOffsetSeconds,2);
  assert.equal(SettingsSchema.decode(port.backup).configuration.globalOffsetSeconds,1); assert.equal(store.status().dirty,false);
});

test('a failed older write still allows queued newer save and never retries stale contents', async () => {
  const port=new Port(); const store=new SettingsStore(port,0); await store.load(); const gate=deferred(); port.gate=gate;
  const original=port.writeAtomic.bind(port); let attempts=0;
  port.writeAtomic=async (...args)=>{ attempts++; if(attempts===1){ await gate.promise; throw new Error('first failed'); } return original(...args); };
  const p1=store.save(config(1)); const flushed=store.flush(); const p2=store.save(config(2)); gate.resolve();
  const [r1,r2]=await Promise.all([p1,p2]); await flushed;
  assert.equal(r1.status,'failed'); assert.equal(r2.status,'saved');
  assert.equal(SettingsSchema.decode(port.primary).configuration.globalOffsetSeconds,2); assert.equal(store.status().dirty,false);
});

test('unknown backup schema is preserved, invalid save never reaches IO and save-before-load blocks', async () => {
  const port=new Port(); port.backup='{"schemaVersion":9}'; const store=new SettingsStore(port,0);
  assert.equal((await store.save(config(1))).status,'blocked'); const result=await store.load(); assert.equal(result.readOnly,true);
  const clean=new SettingsStore(new Port(),0); await clean.load(); const invalid=config(0); invalid.globalOffsetSeconds=NaN;
  assert.equal((await clean.save(invalid)).status,'failed'); assert.equal(clean.status().revision,0);
});

test('oversized default expansion is recoverable invalid data, never a permanently rejected load', async () => {
  const axes=Array.from({length:32},(_,i)=>({name:String.fromCharCode(65+Math.floor(i/10))+String(i%10)}));
  const port=new Port();port.primary=JSON.stringify({schemaVersion:1,devices:Array.from({length:30},(_,i)=>({id:'custom-'+i,axes}))});
  port.backup=encode(4);const store=new SettingsStore(port,0);const result=await store.load();
  assert.equal(result.source,'backup');assert.equal(result.configuration.globalOffsetSeconds,4);
  assert.equal(result.recoveryRequired,true);assert.equal(store.status().loaded,true);assert.equal(port.writes.length,0);
  assert.equal((await store.load()).source,'backup');assert.equal((await store.save(config(5))).status,'blocked');
});

test('non-Error IO rejections are also visible instead of poisoning the load promise', async () => {
  const store=new SettingsStore({read:async()=>{throw null;},writeAtomic:async()=>{}},0);
  const loaded=await store.load();assert.equal(loaded.readOnly,true);assert.equal(store.status().lastError,'null');
  assert.equal((await store.load()).readOnly,true);
});
