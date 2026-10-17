import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,edit,connect,settle,playing,SettingsSchema} from './multi-output-helpers.mjs';
function settings(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;for(const d of c.axisSettingsByDevice)for(const a of d.axes)Object.assign(a.settings,{autoHomeEnabled:false,selectedMotionProvider:null});return c;}
async function targets(manual=true){
 const s=setup(settings());if(manual)await s.page.startManualPreview();
 const ids=[];for(let i=0;i<2;i++){s.page.addOutputTarget('tcp');const id=s.page.selectedOutputId;edit(s,id);const draft=s.Owner.draftSnapshot(id);draft.model.pausedManual=true;draft.editRevision++;s.page.updateOutputDraft(draft);assert.ok(await connect(s,id));ids.push(id);}
 const port=id=>s.ports.find(p=>p.id===id).port;
 const step=()=>{s.time.now+=40;s.engine.tick(40,s.time.now);s.page.syncOutput();};
 if(manual){step();s.page.armOutput(ids[0]);s.page.armOutput(ids[1]);s.engine.setAxisValue('L0',.8,1);step();}
 else {playing(s);s.page.armOutput(ids[0]);s.page.armOutput(ids[1]);s.page.syncOutput();}
 return {...s,ids,port,step};
}
for(const kind of ['closed','error'])test('actual owner '+kind+' callback synchronously revokes global manual preview and peer queues before next fixed deadline',async()=>{
 const s=await targets(),[a,b]=s.ids;s.port(a).emit({kind,connectionGeneration:s.port(a).openRecords().at(-1)});
 assert.equal(s.engine.isManualPreviewActive(),false,'no UI refresh or microtask required');assert.equal(s.page.output.get(a).status().armed,false);assert.equal(s.page.output.get(b).status().armed,false);
 await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,0);assert.equal(s.port(a).writeRecords().length,0);
 s.engine.setAxisValue('L0',.4,0);s.step();await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,0);await s.page.output.dispose();
});
for(const action of ['disconnect','dispose','background'])test('direct coordinator '+action+' closes global manual peers synchronously',async()=>{
 const s=await targets(),[a,b]=s.ids,c=s.page.output.get(a);let closing;
 if(action==='background')c.setForeground(false);else closing=c[action]();
 assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.page.output.get(b).status().armed,false);
 await closing;await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,0);await s.page.output.dispose();
});

test('write timeout callback revokes manual peers and prevents their late in-flight receipts committing or pumping queued work',async()=>{
 const s=await targets(),[a,b]=s.ids;s.port(a).planWrite({kind:'defer'});s.port(b).planWrite({kind:'defer'});await s.time.advance(10);
 assert.equal(s.port(a).writeRecords().length,1);assert.equal(s.port(b).writeRecords().length,1);
 s.engine.setAxisValue('L0',.3,1);s.step();await s.time.advance(10);assert.equal(s.page.output.get(b).status().pendingFixed,true);
 const deadline=s.port(a).writeRecords()[0].deadlineMonotonicMs;
 while(s.time.now<deadline)await s.time.advance(Math.min(10,deadline-s.time.now));
 assert.equal(s.page.output.get(a).status().lastErrorCode,'writeExpired');assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.page.output.get(b).status().armed,false);
 s.port(b).resolveNextWrite();s.port(a).resolveNextWrite();await settle();await s.time.advance(10);
 assert.equal(s.port(b).writeRecords().length,1);assert.equal(s.page.output.get(b).status().completedLocalWrites,0);assert.deepEqual(s.page.output.get(b).status().lastWritten,[]);
 await s.page.output.dispose();
});

test('write rejection revokes manual peers before their next fixed callback without UI polling',async()=>{
 const s=await targets(),[a,b]=s.ids;s.port(a).planWrite({kind:'reject'});
 // Run A's already-scheduled fixed callback, then its rejection microtask, before B's deadline.
 const next=[...s.time.tasks].filter(([,task])=>task.at<=s.time.now+10).sort((x,y)=>x[0]-y[0])[0];assert.ok(next);
 s.time.now+=10;s.time.tasks.delete(next[0]);next[1].fn();await settle();
 assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.page.output.get(b).status().armed,false);await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,0);await s.page.output.dispose();
});

test('obsolete transport generation and replaced session callbacks cannot revoke newly started manual preview',async()=>{
 const s=await targets(),[a,b]=s.ids,old=s.port(a),oldGeneration=old.openRecords().at(-1),oldSession=s.page.output.get(a).session;
 await s.page.output.get(a).disconnect();assert.equal(s.engine.isManualPreviewActive(),false);
 assert.ok(await connect(s,a));s.engine.startManualPreview();s.engine.setAxisValue('L0',.6,1);s.step();s.page.armOutput(a);s.page.armOutput(b);assert.equal(s.page.output.get(b).status().armed,true);s.step();
 old.emit({kind:'closed',connectionGeneration:oldGeneration});oldSession.onTerminalGateRevoked();
 const fresh=s.ports.filter(p=>p.id===a).at(-1).port;fresh.emit({kind:'closed',connectionGeneration:fresh.openRecords().at(-1)-1});
 assert.equal(s.engine.isManualPreviewActive(),true);assert.equal(s.page.output.get(b).status().armed,true);await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,1);await s.page.output.dispose();
});
for(const kind of ['closed','error'])test('ordinary media '+kind+' keeps unrelated target armed and media running',async()=>{
 const s=await targets(false),[a,b]=s.ids;s.port(a).emit({kind,connectionGeneration:s.port(a).openRecords().at(-1)});
 assert.equal(s.engine.isManualPreviewActive(),false);assert.equal(s.engine.snapshot().state,'playing');assert.equal(s.page.output.get(b).status().armed,true);
 await s.time.advance(10);assert.equal(s.port(b).writeRecords().length,1);await s.page.output.dispose();
});
