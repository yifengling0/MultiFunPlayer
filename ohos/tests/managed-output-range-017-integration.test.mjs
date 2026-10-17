import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,edit,playing,connect,settle,SettingsSchema} from './multi-output-helpers.mjs';
const {defaultShortcutAction,KeyboardShortcutConfiguration,KeyboardShortcutMapping,cloneShortcutAction}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {ShortcutKeyEvent}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const {applyOutputRangeAction}=await import('../entry/src/main/ets/input/ShortcutOutputRangeActions.ts');
function config(){const c=SettingsSchema.defaults();for(const k of Object.keys(c.sync))if(k.startsWith('sync'))c.sync[k]=false;return c;}
const command=(id,operation,value=.2)=>{const a=defaultShortcutAction('OutputTarget::Axis::Range::'+operation);a.outputTargetId=id;a.targetAxis='L0';a.value=value;return a;};
const coordinator=(h,id)=>h.page.output.get(id),port=(h,id)=>h.ports.find(p=>p.id===id).port;
async function harness({armed=true,polled=false}={}){const h=setup(config(),{actualResources:true});h.ids=[];for(const kind of ['tcp','udp']){h.page.addOutputTarget(kind);const id=h.page.selectedOutputId;h.ids.push(id);const d=edit(h,id);d.model.polled=polled;d.model.dirtyOnly=false;d.editRevision++;h.page.updateOutputDraft(d);}playing(h);for(const id of h.ids){assert.ok(await connect(h,id));if(armed)h.page.armOutput(id);}return h;}
async function tick(h,ms=40){await h.time.advance(ms);h.engine.tick(ms,h.time.now);h.page.syncOutput();}
for(const field of ['Minimum','Maximum','Middle','Size'])for(const kind of ['Set','Offset'])test('actual Index persists exact '+field+' '+kind+' for one explicit target only',async()=>{
 const h=setup(config());try{h.page.addOutputTarget('tcp');const one=h.page.selectedOutputId;edit(h,one);h.page.addOutputTarget('udp');const two=h.page.selectedOutputId;edit(h,two);
 const a=command(one,field+'::'+kind,.2),before=h.Owner.draftSnapshot(one),other=h.Owner.draftSnapshot(two);
 const expected=applyOutputRangeAction(before.model.ranges[0],{operation:field+'::'+kind,value:a.value,minimumLimit:kind==='Offset'&&field!=='Maximum'?a.secondaryValue:0,maximumLimit:kind==='Offset'?(field==='Maximum'?a.secondaryValue:field==='Minimum'?1:a.tertiaryValue):1});
 await h.page.touchShortcut(a);assert.deepEqual(h.Owner.draftSnapshot(one).model.ranges[0],expected.range);assert.deepEqual(h.Owner.draftSnapshot(two),other);
 assert.equal(h.ports.length,0);assert.equal(h.engine.snapshot().state,'stopped');const restored=SettingsSchema.clone(h.engine.configurationSnapshot());assert.deepEqual(restored.outputs.targets.find(x=>x.id===one).rangesByDevice[0].ranges[0],expected.range);
 }finally{await h.page.output.dispose();}
});
test('reversed MinimumOffset limit is persisted without sorting and target disabled axis stays disabled',async()=>{
 const h=setup(config());try{h.page.addOutputTarget('tcp');const id=h.page.selectedOutputId;let d=edit(h,id);d.model.ranges[0]={axisId:'L0',minimum:.2,maximum:.8,enabled:false};d.editRevision++;h.page.updateOutputDraft(d);
 const a=command(id,'Minimum::Offset',1);a.secondaryValue=1;await h.page.touchShortcut(a);
 assert.deepEqual(h.Owner.draftSnapshot(id).model.ranges[0],{axisId:'L0',minimum:1,maximum:.8,enabled:false});assert.match(h.page.inputMessage,/反向/);assert.match(h.page.inputMessage,/仍禁用/);assert.equal(h.ports.length,0);
 }finally{await h.page.output.dispose();}
});
test('live edit clears old backlog and receipts only for named target, waits a genuine frame, preserves existing arm',async()=>{
 const h=await harness();try{const[id,other]=h.ids,c=coordinator(h,id),p=port(h,id);p.planWrite({kind:'defer'});await h.time.advance(10);await tick(h);await h.time.advance(10);assert.equal(c.status().inFlight,true);assert.equal(c.status().pendingFixed,true);
 const oldframe=h.engine.frame();await h.page.executeShortcutAction(command(id,'Minimum::Set',.4),'L0');
 assert.equal(c.status().armed,true);assert.equal(c.status().pendingFixed,false);assert.equal(c.status().queuedEvents,0);assert.equal(c.status().dispatchSuspended,true);assert.equal(h.engine.frame(),oldframe);
 p.resolveNextWrite();await settle();assert.equal(c.status().completedLocalWrites,0);assert.equal(c.status().lastWritten.length,0);const writes=p.writeRecords().length;await h.time.advance(10);assert.equal(p.writeRecords().length,writes);assert.ok(coordinator(h,other).status().completedLocalWrites>0);
 await tick(h);await h.time.advance(10);assert.ok(p.writeRecords().length>writes);assert.equal(c.status().armed,true);
 }finally{await h.page.output.dispose();}
});
for(const armed of [false,true])test('range changes never recreate revoked arm; initial armed='+armed,async()=>{
 const h=await harness({armed});try{const id=h.ids[0];if(armed)h.page.stop();await h.page.executeShortcutAction(command(id,'Maximum::Set',.8),'L0');await tick(h);assert.equal(coordinator(h,id).status().armed,false);assert.equal(port(h,id).writeRecords().length,0);}finally{await h.page.output.dispose();}
});
test('connected target with unapplied draft rejects atomic range action without changing another setting',async()=>{
 const h=await harness();try{const id=h.ids[0],d=h.Owner.draftSnapshot(id);h.page.disarmOutput(id,d.targetGeneration);d.port++;d.applicationId=0;d.editRevision++;h.page.updateOutputDraft(d);const before=h.Owner.draftSnapshot(id);
 await assert.rejects(h.page.executeShortcutAction(command(id,'Maximum::Set',.8),'L0'));assert.deepEqual(h.Owner.draftSnapshot(id),before);assert.equal(coordinator(h,id).status().armed,false);
 }finally{await h.page.output.dispose();}
});
test('queued action binds original instance generation, never a removed/recreated same stable ID',async()=>{
 const h=setup(config());try{h.page.addOutputTarget('tcp');const id=h.page.selectedOutputId;edit(h,id);const action=command(id,'Minimum::Set',.4),cfg=new KeyboardShortcutConfiguration(),m=new KeyboardShortcutMapping('range');m.keys=[2017];m.actions=[action];cfg.mappings=[m];h.page.keyboard.setConfiguration(cfg);h.page.updateKeyboardContext();const [dispatch]=h.page.keyboard.keyEvent(new ShortcutKeyEvent(2017,true),0);
 let resume;h.page.shortcutQueue=new Promise(r=>resume=r);h.page.shortcutQueueToken=dispatch.token;const work=h.page.runShortcutDispatch(dispatch);await h.page.removeOutputTarget(id);h.page.addOutputTarget('tcp');edit(h,id);const before=h.Owner.draftSnapshot(id);resume();await work;assert.deepEqual(h.Owner.draftSnapshot(id),before);assert.match(h.page.inputMessage,/实例已失效/);
 }finally{await h.page.output.dispose();}
});
test('additive action DTO validates finite independent limits and exact bounded target IDs',()=>{
 const a=command('webSocket:9','Middle::Offset',-.1);a.secondaryValue=.9;a.tertiaryValue=.1;assert.deepEqual(cloneShortcutAction(a),a);
 for(const bad of [{outputTargetId:'tcp:10'},{outputTargetId:'file:///secret'},{tertiaryValue:NaN},{tertiaryValue:1.1},{secondaryValue:-1}])assert.throws(()=>cloneShortcutAction({...a,...bad}));
 const old={id:'Media::PlayPause::Toggle',value:0};const copy=cloneShortcutAction(old);assert.equal(copy.outputTargetId,'');assert.equal(copy.tertiaryValue,0);
});
