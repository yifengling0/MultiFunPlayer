import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const { FixedScheduler, FixedStats, PolledStats, defaultFixedContext, validateFixedContext }=await import('../entry/src/main/ets/output/UpdateContext.ts');
class VirtualTime {
  now=0; next=1; tasks=new Map();
  nowMs(){return this.now;}
  scheduleAt(at,callback){const id=this.next++;this.tasks.set(id,{at,callback});return id;}
  cancel(id){this.tasks.delete(id);}
  advanceTo(target){
    while(true){const next=[...this.tasks].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
      this.now=next[1].at;this.tasks.delete(next[0]);next[1].callback();}
    this.now=target;
  }
  wakeLate(now){this.now=now;const due=[...this.tasks].filter(([,x])=>x.at<=now);for(const[id,item]of due){if(this.tasks.delete(id))item.callback();}}
}
test('fixed defaults preserve generic and WebSocket configurations; precise sleep is not pretended',()=>{
  assert.deepEqual(defaultFixedContext(),{kind:'fixed',intervalMs:10,minimumIntervalMs:3,maximumIntervalMs:33,sendDirtyValuesOnly:true,offloadElapsedTime:false,usePreciseSleep:false});
  const ws=defaultFixedContext(true); assert.equal(ws.intervalMs,16);assert.equal(ws.minimumIntervalMs,16);assert.equal(ws.maximumIntervalMs,200);
  for(const context of [{...ws,intervalMs:15},{...ws,intervalMs:201},{...ws,usePreciseSleep:true},{...ws,intervalMs:NaN}]) assert.throws(()=>validateFixedContext(context),e=>e.code==='invalidConfiguration');
});
test('fixed scheduler uses its own actual monotonic elapsed, including immediate initial zero',()=>{
  const time=new VirtualTime(),ticks=[],errors=[];
  const scheduler=new FixedScheduler(time,time,defaultFixedContext(),x=>ticks.push(x),x=>errors.push(x));
  scheduler.start();time.advanceTo(10);time.wakeLate(47);
  assert.deepEqual(ticks,[0,10,37]);assert.equal(errors.length,0);
  time.advanceTo(57);assert.equal(ticks.at(-1),10);scheduler.stop();time.advanceTo(1000);assert.equal(ticks.length,4);
});
test('late scheduler wakes never burst-catch-up missed intervals',()=>{
  const time=new VirtualTime(),ticks=[];
  const scheduler=new FixedScheduler(time,time,defaultFixedContext(),x=>ticks.push(x),()=>assert.fail());
  scheduler.start();time.wakeLate(1000);assert.deepEqual(ticks,[0,1000]);assert.equal(time.tasks.size,1);
  assert.equal([...time.tasks.values()][0].at,1010);
});
test('60 seconds virtual timing is bounded without real sleeps or media time',()=>{
  const time=new VirtualTime(),ticks=[];
  const scheduler=new FixedScheduler(time,time,defaultFixedContext(),x=>ticks.push(x),()=>assert.fail());
  scheduler.start();time.advanceTo(60000);
  assert.equal(ticks.length,6001);assert.equal(ticks.reduce((a,b)=>a+b,0),60000);
  assert.equal(scheduler.stats.snapshot().averageUpdateRate,100);assert.equal(time.tasks.size,1);scheduler.stop();
});
test('interval change preserves actual elapsed and cancels stale callbacks',()=>{
  const time=new VirtualTime(),ticks=[];
  const scheduler=new FixedScheduler(time,time,defaultFixedContext(),x=>ticks.push(x),()=>assert.fail());
  scheduler.start();time.advanceTo(5);const stale=[...time.tasks.values()][0].callback;
  scheduler.updateContext({...defaultFixedContext(),intervalMs:20});stale();assert.deepEqual(ticks,[0]);
  time.advanceTo(25);assert.deepEqual(ticks,[0,25]);time.advanceTo(45);assert.deepEqual(ticks,[0,25,20]);
});
test('clock reversal faults instead of encoding negative elapsed',()=>{
  const time=new VirtualTime(),ticks=[],errors=[];time.now=100;
  const scheduler=new FixedScheduler(time,time,defaultFixedContext(),x=>ticks.push(x),x=>errors.push(x));
  scheduler.start();const callback=[...time.tasks.values()][0].callback;time.now=90;callback();
  assert.equal(errors[0].code,'invalidClock');assert.deepEqual(ticks,[0]);
});
test('source cadence stats use >.25s window and independent polled per-axis durations',()=>{
  const fixed=new FixedStats();for(let i=0;i<25;i++)fixed.update(10,10);
  // Floating accumulation matches source semantics, rather than replacing > with >=.
  fixed.update(10,10);assert.equal(fixed.snapshot().averageUpdateRate,100);
  const polled=new PolledStats();polled.update('L0',.1,0);polled.update('R0',1,0);
  polled.update('L0',.2,150);assert.ok(Math.abs(polled.averageUpdateErrorMs-50)<1e-10);
  polled.update('R0',1,900);assert.ok(Math.abs(polled.averageUpdateErrorMs+25)<1e-10);
  for(let i=1;i<=30;i++)polled.update('L0',.2,150+i*200);
  assert.equal(polled.retainedErrorCount,25);assert.ok(Math.abs(polled.averageUpdateErrorMs)<1e-10);
});
test('scheduler copies caller context so mutation cannot create zero-delay loops',()=>{
  const time=new VirtualTime(),ticks=[],context=defaultFixedContext();
  const scheduler=new FixedScheduler(time,time,context,x=>ticks.push(x),()=>assert.fail());
  context.intervalMs=0;scheduler.start();time.advanceTo(30);assert.deepEqual(ticks,[0,10,10,10]);
});
