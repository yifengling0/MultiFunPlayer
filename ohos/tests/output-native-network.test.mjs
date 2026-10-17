import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
// Execute the actual ArkTS implementation with ONLY injected in-memory SDK mocks.
// No dgram/net/http/WebSocket module, real endpoint, DNS lookup or physical output.
const names=['NativeTcpTransport','NativeUdpTransport','NativeWebSocketTransport','NativeTransportFactory'];
const admission=readFileSync(new URL('../entry/src/main/ets/output/NativeTransportAdmission.ts',import.meta.url),'utf8').replace(/^import [\s\S]*?;\n/gm,'').replace(/\bexport /g,'');
const source=admission+'\n'+names.map(name=>readFileSync(new URL(`../entry/src/main/ets/output/native/${name}.ets`,import.meta.url),'utf8')
  .replace(/^import [\s\S]*?;\n/gm,'').replace(/\bexport /g,'')).join('\n');
const js=stripTypeScriptTypes(source);
const util={TextEncoder:class{encodeInto(text){return new TextEncoder().encode(text);}},TextDecoder:{create:(enc,opts)=>({decodeToString:bytes=>new TextDecoder(enc,opts).decode(bytes)})}};
const api=new Function('util',js+'\nreturn {NativeTcpTransport,NativeUdpTransport,NativeWebSocketTransport,NativeTransportFactory,isRegisteredNativeTransport,releaseNativeTransport};')(util);
const limits=()=>({connectTimeoutMs:100,writeTimeoutMs:40,closeTimeoutMs:30,maximumPayloadBytes:1024,maximumReceiveBytes:128});
const config=kind=>({kind,protocolProfile:{maximumPayloadBytes:1024}});
const socketEndpoint=()=>({host:'receiver.example',port:9001,family:1});
const wsEndpoint=()=>({scheme:'ws',host:'receiver.example',port:9001,path:'/ws'});
const settle=async()=>{for(let n=0;n<40;n++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const business=(code=201,message='https://name:secret@host/?token=SECRET')=>Object.assign(new Error(message),{code});
class MockSocket {
  constructor(kind){this.kind=kind;this.listeners=new Map();this.calls=[];this.plans=new Map();this.autoOpen=true;this.offFailure=null;}
  plan(method,result){if(!this.plans.has(method))this.plans.set(method,[]);this.plans.get(method).push(result);}
  invoke(method,arg){this.calls.push([method,arg]);const queue=this.plans.get(method);const next=queue?.length?queue.shift():undefined;
    if(next instanceof Error)throw next;if(typeof next==='function')return next();if(next!==undefined)return Promise.resolve(next);
    return Promise.resolve(this.kind==='webSocket'&&['connect','send','close'].includes(method)?true:undefined);}
  on(event,callback){this.calls.push(['on',event]);if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(callback);}
  off(event,callback){this.calls.push(['off',event]);this.listeners.get(event)?.delete(callback);if(this.offFailure===event)throw business();}
  emit(event,...args){for(const callback of [...(this.listeners.get(event)??[])])callback(...args);}
  connect(arg){const result=this.invoke('connect',arg);if(this.kind==='webSocket'&&this.autoOpen)queueMicrotask(()=>this.emit('open',undefined,{}));return result;}
  bind(arg){return this.invoke('bind',arg);}
  setExtraOptions(arg){return this.invoke('extra',arg);}
  send(arg){return this.invoke('send',arg);}
  close(arg){return this.invoke('close',arg);}
  count(method){return this.calls.filter(([name])=>name===method).length;}
  sent(){return this.calls.filter(([name])=>name==='send').map(([,arg])=>arg);}
  listenerCount(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
class Environment {
  now=0;next=1;tasks=new Map();sockets=[];calls=[];unsupported=new Set();plans=[];resolvePlan=null;
  nowMs(){return this.now;}
  supports(cap){this.calls.push(['supports',cap]);return !this.unsupported.has(cap);}
  scheduleAt(at,callback){const id=this.next++;this.tasks.set(id,{at,callback});return id;}
  cancel(id){this.tasks.delete(id);}
  resolveHost(host){this.calls.push(['resolveHost',host]);return this.resolvePlan??Promise.resolve([{address:'192.0.2.10',family:1},{address:'2001:db8::10',family:2}]);}
  create(kind){this.calls.push(['create',kind]);const socket=new MockSocket(kind);this.plans.shift()?.(socket);this.sockets.push(socket);return socket;}
  createTcp(){return this.create('tcp');} createUdp(){return this.create('udp');} createWebSocket(){return this.create('webSocket');}
  async advanceTo(target){for(;;){const due=[...this.tasks].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;
      this.now=due[1].at;this.tasks.delete(due[0]);due[1].callback();await settle();}this.now=target;await settle();}
}
function setup(kind,custom={}){const env=custom.env??new Environment(),factory=new api.NativeTransportFactory(env);
  const port=kind==='tcp'?factory.createTcp(custom.endpoint??socketEndpoint(),custom.limits??limits()):kind==='udp'?factory.createUdp(custom.endpoint??{...socketEndpoint(),localPort:0},custom.limits??limits()):factory.createWebSocket(custom.endpoint??wsEndpoint(),custom.limits??limits());
  const events=[];port.subscribe(event=>events.push(event));return {port,env,events,kind};}
async function opened(kind,custom={}){const s=setup(kind,custom);await s.port.open(config(kind),1);return s;}
const request=(s,text='L05000I10\n',extra={})=>({bytes:new TextEncoder().encode(text),epoch:0,profileRevision:1,connectionGeneration:1,deadlineMonotonicMs:s.env.now+30,...extra});
const code=expected=>error=>error.code===expected;

for(const kind of ['tcp','udp','webSocket']){
  test(`${kind}: factory/constructor/capability checks are inert and explicit open never writes`,async()=>{
    const s=setup(kind);assert.equal(s.env.sockets.length,0);assert.equal(s.port.simulationOnly,false);assert.equal(s.port.status().state,'disconnected');
    assert.equal(new api.NativeTransportFactory(s.env).inspect(kind).diagnostic,'availableDisconnected');assert.equal(s.env.sockets.length,0);
    await s.port.open(config(kind),1);assert.equal(s.port.status().state,'ready');assert.equal(s.env.sockets[0].count('send'),0);
    assert.equal(s.port.status().remoteAcknowledgement,false);await s.port.close('do not log secret',1);assert.equal(s.env.sockets[0].listenerCount(),0);assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: exact UTF-8/subarray bytes, immutable request, full local receipt only`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],data=new TextEncoder().encode('xL05000I10\n中😀y');
    const bytes=data.subarray(1,data.length-1),expected=bytes.slice(),wait=deferred();sock.plan('send',wait.promise);
    const operation=s.port.write(request(s,'',{bytes}));data.fill(0);await settle();
    const sent=sock.sent()[0];if(kind==='webSocket'){assert.equal(typeof sent,'string');assert.deepEqual(new TextEncoder().encode(sent),expected);}
    else assert.deepEqual(new Uint8Array(sent.data),expected);
    wait.resolve(kind==='webSocket'?true:undefined);assert.deepEqual(await operation,{acceptedBytes:expected.length,connectionGeneration:1});
    assert.equal(sock.count('send'),1);assert.equal(s.events.length,0);await s.port.close('',1);
  });
  test(`${kind}: expired/empty/oversized/concurrent/stale writes cannot enter native send`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0];
    await assert.rejects(s.port.write(request(s,'',{deadlineMonotonicMs:0})),code('invalidPayloadSize'));
    await assert.rejects(s.port.write(request(s,'a',{deadlineMonotonicMs:0})),code('writeExpired'));
    await assert.rejects(s.port.write(request(s,'x'.repeat(1025))),code('invalidPayloadSize'));
    await assert.rejects(s.port.write(request(s,'a',{connectionGeneration:0})),code('notConnected'));
    assert.equal(sock.count('send'),0);const wait=deferred();sock.plan('send',wait.promise);const pending=s.port.write(request(s));
    await assert.rejects(s.port.write(request(s)),code('concurrentWrite'));assert.equal(sock.count('send'),1);
    wait.resolve(kind==='webSocket'?true:undefined);await pending;await s.port.close('',1);
  });
  test(`${kind}: unknown failure cannot retransmit; diagnostics discard secret-bearing SDK messages`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0];sock.plan('send',business());
    await assert.rejects(s.port.write(request(s)),/Native output/);assert.equal(sock.count('send'),1);assert.equal(s.port.status().state,'fault');
    assert.ok(!JSON.stringify([s.events,s.port.status()]).includes('SECRET'));assert.equal(sock.listenerCount(),0);await settle();assert.equal(s.env.tasks.size,0);
    await assert.rejects(s.port.write(request(s)),code('notConnected'));assert.equal(sock.count('send'),1);
  });
  test(`${kind}: deadline cancels hung send, late success never completes/replays a frame`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],wait=deferred();sock.plan('send',wait.promise);
    const promise=s.port.write(request(s));const rejection=assert.rejects(promise,code('writeTimeout'));await s.env.advanceTo(30);await rejection;
    await s.port.open(config(kind),2);wait.resolve(kind==='webSocket'?true:undefined);await settle();
    assert.equal(s.port.status().connectionGeneration,2);assert.equal(s.port.status().state,'ready');assert.equal(s.env.sockets[1].count('send'),0);
    await s.port.close('',2);assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: explicit cancel rejects pending write and old callbacks/close cannot affect new socket`,async()=>{
    const s=await opened(kind),old=s.env.sockets[0],wait=deferred();old.plan('send',wait.promise);
    const oldError=[...old.listeners.get('error')][0],oldClose=[...old.listeners.get('close')][0];
    const pending=s.port.write(request(s));const rejection=assert.rejects(pending,code('cancelled'));await s.port.close('',1);await rejection;
    await s.port.open(config(kind),2);oldError(business());oldClose();wait.resolve(kind==='webSocket'?true:undefined);await settle();await s.port.close('',1);
    assert.equal(s.port.status().state,'ready');assert.equal(s.env.sockets[1].count('close'),0);assert.equal(old.listenerCount(),0);await s.port.close('',2);
  });
  test(`${kind}: peer close/error invalidates writes; all listener cleanup attempted despite off throwing`,async()=>{
    for(const event of ['close','error']){
      const s=await opened(kind),sock=s.env.sockets[0];sock.offFailure='message';sock.emit(event,business());await settle();
      assert.equal(sock.listenerCount(),0);assert.equal(sock.count('close'),1);await assert.rejects(s.port.write(request(s)),code('notConnected'));
      assert.equal(s.events.length,1);assert.equal(s.events[0].kind,event==='close'?'closed':'error');assert.equal(s.env.tasks.size,0);
    }
  });
  test(`${kind}: close is bounded, failure is reported and local gate closes synchronously`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],wait=deferred();sock.plan('close',wait.promise);
    const closing=s.port.close('',1);const rejection=assert.rejects(closing,code('closeTimeout'));
    await assert.rejects(s.port.write(request(s)),code('notConnected'));assert.equal(sock.listenerCount(),0);await s.env.advanceTo(30);await rejection;
    wait.resolve(kind==='webSocket'?true:undefined);await settle();assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: late completion after deadline faults even if timer callback has not run`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],wait=deferred();sock.plan('send',wait.promise);
    const promise=s.port.write(request(s));const rejection=assert.rejects(promise,code('writeTimeout'));s.env.now=31;wait.resolve(kind==='webSocket'?true:undefined);await rejection;await settle();
    assert.equal(s.port.status().state,'fault');assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: event receive is bounded and detached from SDK bytes`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],buffer=new Uint8Array([1,2,3]);
    if(kind==='webSocket')sock.emit('message',undefined,buffer.buffer);else sock.emit('message',{message:buffer.buffer,remoteInfo:{address:'192.0.2.10',port:9001}});
    buffer.fill(9);assert.deepEqual(s.events[0].bytes,new Uint8Array([1,2,3]));
    if(kind==='webSocket')sock.emit('message',undefined,'x'.repeat(129));else sock.emit('message',{message:new ArrayBuffer(129),remoteInfo:{address:'192.0.2.10',port:9001}});
    assert.equal(s.port.status().diagnostic,'receiveTooLarge');await settle();assert.equal(sock.listenerCount(),0);
  });
}

test('factory rejects unsupported kinds/capabilities without creating a socket or DNS query',async()=>{
  const env=new Environment(),factory=new api.NativeTransportFactory(env);for(const kind of ['serial','file','pipe','buttplug','handy','memory'])assert.equal(factory.inspect(kind).available,false);
  env.unsupported.add('SystemCapability.Communication.NetStack');for(const kind of ['tcp','udp','webSocket']){
    assert.equal(factory.inspect(kind).available,false);const s=setup(kind,{env});await assert.rejects(s.port.open(config(kind),1),code('unsupportedSystemCapability'));
  }assert.equal(env.sockets.length,0);assert.ok(!env.calls.some(([op])=>op==='resolveHost'));
});
test('TCP/UDP DNS is explicit, family-specific, asynchronous and never survives cancellation into connect/bind',async()=>{
  for(const kind of ['tcp','udp']){
    const env=new Environment(),wait=deferred();env.resolvePlan=wait.promise;const s=setup(kind,{env});const pending=s.port.open(config(kind),1),rejection=assert.rejects(pending,code('cancelled'));
    await settle();await s.port.close('',1);await rejection;wait.resolve([{address:'192.0.2.10',family:1}]);await settle();
    const sock=env.sockets[0];assert.equal(sock.count('connect')+sock.count('bind')+sock.count('send'),0);assert.equal(sock.listenerCount(),0);
  }
});
test('TCP/UDP late native connect/bind closes the exact old handle after replacement',async()=>{
  for(const kind of ['tcp','udp']){
    const env=new Environment(),wait=deferred();env.plans.push(sock=>sock.plan(kind==='tcp'?'connect':'bind',wait.promise));const s=setup(kind,{env});
    const pending=s.port.open(config(kind),1),rejection=assert.rejects(pending,code('superseded'));await settle();const old=env.sockets[0];
    const replacement=s.port.open(config(kind),2);await rejection;await settle();assert.equal(env.sockets.length,1);
    wait.resolve();await replacement;await settle();assert.ok(old.count('close')>=2);assert.equal(env.sockets[1].count('close'),0);
    assert.equal(s.port.status().state,'ready');await s.port.close('',2);
  }
});
test('TCP uses stream semantics and NoDelay; UDP binds explicitly, sends separate datagrams and filters alien peers',async()=>{
  const tcp=await opened('tcp');assert.equal(tcp.port.writeSemantics,'stream');assert.deepEqual(tcp.env.sockets[0].calls.find(([name])=>name==='extra')[1],{TCPNoDelay:true});await tcp.port.close('',1);
  const udp=await opened('udp');assert.equal(udp.port.writeSemantics,'message');const sock=udp.env.sockets[0];
  assert.deepEqual(sock.calls.find(([name])=>name==='bind')[1],{address:'0.0.0.0',family:1,port:0});
  await udp.port.write(request(udp,'one\n'));await udp.port.write(request(udp,'two\n'));assert.equal(sock.sent().length,2);assert.deepEqual(sock.sent().map(x=>Buffer.from(x.data).toString()),['one\n','two\n']);
  assert.deepEqual(sock.sent()[0].address,{address:'192.0.2.10',family:1,port:9001});sock.emit('message',{message:new ArrayBuffer(1),remoteInfo:{address:'192.0.2.99',port:9001}});assert.equal(udp.events.length,0);await udp.port.close('',1);
});
test('SDK void sends cannot be misinterpreted as partial counts, and no short datagram is retried',async()=>{
  for(const kind of ['tcp','udp']){const s=await opened(kind),sock=s.env.sockets[0];sock.plan('send',3);
    await assert.rejects(s.port.write(request(s)),code('unexpectedSendResult'));assert.equal(sock.count('send'),1);assert.equal(s.port.status().state,'fault');}
});
test('WebSocket connect(true) does not report ready before open; timeout recycles listeners',async()=>{
  const env=new Environment();env.plans.push(sock=>sock.autoOpen=false);const s=setup('webSocket',{env});const pending=s.port.open(config('webSocket'),1);
  const rejection=assert.rejects(pending,code('openTimeout'));await settle();assert.equal(s.port.status().state,'connecting');await assert.rejects(s.port.write(request(s)),code('notConnected'));
  assert.equal(env.sockets[0].count('send'),0);await env.advanceTo(100);await rejection;assert.equal(env.sockets[0].listenerCount(),0);assert.equal(env.tasks.size,0);
});
test('WebSocket late open after cancellation only recloses old socket; new generation requires its own open',async()=>{
  const env=new Environment();env.plans.push(sock=>sock.autoOpen=false);const s=setup('webSocket',{env});const pending=s.port.open(config('webSocket'),1),rejection=assert.rejects(pending,code('superseded'));
  await settle();const old=env.sockets[0],callback=[...old.listeners.get('open')][0];await s.port.open(config('webSocket'),2);await rejection;
  callback(undefined,{});await settle();assert.ok(old.count('close')>=2);assert.equal(env.sockets[1].count('close'),0);assert.equal(s.port.status().state,'ready');await assert.rejects(s.port.close('',2),code('closeUnconfirmed'));
});
test('WebSocket false connect/send and malformed UTF-8 fail closed without binary fallback',async()=>{
  const env=new Environment();env.plans.push(sock=>sock.plan('connect',false));const c=setup('webSocket',{env});await assert.rejects(c.port.open(config('webSocket'),1),code('webSocketConnectRejected'));await settle();assert.equal(env.sockets[0].listenerCount(),0);
  const s=await opened('webSocket');s.env.sockets[0].plan('send',false);await assert.rejects(s.port.write(request(s)),code('webSocketSendRejected'));assert.equal(s.env.sockets[0].count('send'),1);
  const invalid=await opened('webSocket');await assert.rejects(invalid.port.write(request(invalid,'',{bytes:new Uint8Array([0xff])})));assert.equal(invalid.env.sockets[0].count('send'),0);assert.equal(invalid.port.status().state,'fault');
});
test('WebSocket synchronous connect exception cannot create an unhandled opened-promise rejection',async()=>{
  const env=new Environment();env.plans.push(sock=>sock.plan('connect',business()));const s=setup('webSocket',{env});await assert.rejects(s.port.open(config('webSocket'),1));await settle();assert.equal(env.sockets[0].listenerCount(),0);assert.equal(env.tasks.size,0);
});
test('configuration has no default endpoint, rejects credentials/query, snapshots mutable caller settings',async()=>{
  for(const host of ['','user:password@host','host/?token=SECRET','https://host',' host','host%2fsecret'])assert.throws(()=>setup('tcp',{endpoint:{...socketEndpoint(),host}}));
  for(const path of ['','/ws?token=SECRET','/ws#secret','/%61'])assert.throws(()=>setup('webSocket',{endpoint:{...wsEndpoint(),path}}));
  for(const port of [0,-1,65536,1.5,NaN])assert.throws(()=>setup('tcp',{endpoint:{...socketEndpoint(),port}}));
  const endpoint=socketEndpoint(),l=limits(),s=setup('tcp',{endpoint,limits:l});endpoint.host='evil.example';endpoint.port=1234;l.maximumPayloadBytes=1;
  await s.port.open(config('tcp'),1);assert.deepEqual(s.env.calls.find(([name])=>name==='resolveHost'),['resolveHost','receiver.example']);await s.port.write(request(s));await s.port.close('',1);
});
test('reused/backward generations and mismatched kinds never create new native objects',async()=>{
  const s=await opened('tcp');await assert.rejects(s.port.open(config('tcp'),1),code('invalidOpenConfiguration'));await assert.rejects(s.port.open(config('udp'),2),code('invalidOpenConfiguration'));
  assert.equal(s.env.sockets.length,1);await s.port.close('',1);await assert.rejects(s.port.open(config('tcp'),0));assert.equal(s.env.sockets.length,1);
});
test('IPv6 uses requested family and explicit UDP wildcard; WS constructs bracketed address without implicit ports',async()=>{
  const s=await opened('udp',{endpoint:{host:'2001:db8::10',port:9001,family:2,localPort:0}});assert.deepEqual(s.env.sockets[0].calls.find(([name])=>name==='bind')[1],{address:'::',family:2,port:0});await s.port.close('',1);
  const ws=await opened('webSocket',{endpoint:{scheme:'wss',host:'::1',port:9443,path:'/ws'}});assert.equal(ws.env.sockets[0].calls.find(([name])=>name==='connect')[1],'wss://[::1]:9443/ws');await ws.port.close('',1);
});
test('WebSocket immediate cancel before asynchronous request creation never initiates native connect',async()=>{
  const s=setup('webSocket'),pending=s.port.open(config('webSocket'),1),rejection=assert.rejects(pending,code('cancelled'));
  await s.port.close('',1);await rejection;await settle();assert.equal(s.env.sockets[0].count('connect'),0);assert.equal(s.env.sockets[0].listenerCount(),0);assert.equal(s.env.tasks.size,0);
});
test('TCP/UDP resolver rejection, missing family and socket allocation errors report sanitized faults without retries',async()=>{
  for(const kind of ['tcp','udp']){
    for(const mode of ['dns','family','allocate']){
      const env=new Environment();if(mode==='dns')env.resolvePlan=Promise.reject(business());else if(mode==='family')env.resolvePlan=Promise.resolve([{address:'2001:db8::10',family:2}]);
      else env.create=()=>{throw business();};const s=setup(kind,{env});await assert.rejects(s.port.open(config(kind),1));await settle();
      assert.equal(s.port.status().state,'fault');assert.ok(!JSON.stringify(s.events).includes('SECRET'));assert.ok(env.sockets.every(sock=>sock.count('connect')+sock.count('bind')+sock.count('send')===0));assert.equal(env.tasks.size,0);
    }
  }
});
test('close rejection remains observable while no arbitrary close reason reaches SDK or diagnostics',async()=>{
  for(const kind of ['tcp','udp','webSocket']){
    const s=await opened(kind),sock=s.env.sockets[0];sock.plan('close',business());await assert.rejects(s.port.close('SECRET user reason',1),/closeFailed/);await settle();
    assert.equal(sock.listenerCount(),0);assert.ok(!JSON.stringify([sock.calls,s.events,s.port.status()]).includes('SECRET'));assert.equal(s.env.tasks.size,0);
  }
});
test('WebSocket native open error and early close reject connecting operation, detach every listener',async()=>{
  for(const event of ['open','error','close']){
    const env=new Environment();env.plans.push(sock=>sock.autoOpen=false);const s=setup('webSocket',{env});const pending=s.port.open(config('webSocket'),1),rejection=assert.rejects(pending);
    await settle();env.sockets[0].emit(event,business(),{});await rejection;await settle();assert.notEqual(s.port.status().state,'ready');assert.equal(env.sockets[0].listenerCount(),0);assert.equal(env.tasks.size,0);
  }
});
test('TCP/UDP send timeout is capped independently of a long request deadline',async()=>{
  for(const kind of ['tcp','udp']){const s=await opened(kind),wait=deferred();s.env.sockets[0].plan('send',wait.promise);
    const pending=s.port.write(request(s,'abc',{deadlineMonotonicMs:1000})),rejection=assert.rejects(pending,code('writeTimeout'));await s.env.advanceTo(40);await rejection;wait.reject(business());await settle();assert.equal(s.env.tasks.size,0);}
});
test('WebSocket string receiver is UTF-8 diagnostics, not a return control-command interpreter',async()=>{
  const s=await opened('webSocket'),sock=s.env.sockets[0];sock.emit('message',undefined,'中😀\n');assert.deepEqual(s.events[0].bytes,new TextEncoder().encode('中😀\n'));
  assert.equal(sock.count('send'),0);assert.equal(sock.count('connect'),1);await s.port.close('',1);
});
test('protocol-profile payload maximum further limits configured native payload size',async()=>{
  const s=setup('tcp');await s.port.open({kind:'tcp',protocolProfile:{maximumPayloadBytes:3}},1);
  await assert.rejects(s.port.write(request(s,'1234')),code('invalidPayloadSize'));assert.equal(s.env.sockets[0].count('send'),0);await s.port.close('',1);
});
test('separate transport instances with same generation never share sockets or receive listeners',async()=>{
  const env=new Environment(),a=await opened('tcp',{env}),b=await opened('tcp',{env});await a.port.close('',1);assert.equal(env.sockets[1].count('close'),0);
  await b.port.write(request(b));assert.equal(env.sockets[1].count('send'),1);assert.equal(env.sockets[0].count('send'),0);await b.port.close('',1);
});
test('subscriber exception cannot prevent other diagnostics or cleanup; unsubscribe is idempotent',async()=>{
  const s=await opened('tcp');const off=s.port.subscribe(()=>{throw new Error('observer');});off();off();s.port.subscribe(()=>{throw new Error('observer');});let called=0;s.port.subscribe(()=>called++);
  s.env.sockets[0].emit('error',business());await settle();assert.equal(called,1);assert.equal(s.env.sockets[0].listenerCount(),0);assert.equal(s.env.tasks.size,0);
});
test('resolver omitted family follows SDK NetAddress IPv4 default, never silently changes explicit IPv6',async()=>{
  const env=new Environment();env.resolvePlan=Promise.resolve([{address:'192.0.2.10'}]);const s=await opened('tcp',{env});await s.port.close('',1);
  const no6=setup('tcp',{env,endpoint:{...socketEndpoint(),family:2}});await assert.rejects(no6.port.open(config('tcp'),1),code('addressFamilyUnavailable'));
});
test('factory identity registration is kind-bound and releasable; marker alone and direct construction are not admission',async()=>{
  const env=new Environment(),factory=new api.NativeTransportFactory(env);
  for(const kind of ['tcp','udp','webSocket']){
    const s=setup(kind,{env});assert.equal(s.port.nativeNetworkKind,kind);assert.equal(api.isRegisteredNativeTransport(s.port,kind),true);
    assert.equal(api.isRegisteredNativeTransport(s.port,kind==='tcp'?'udp':'tcp'),false);assert.equal(s.port.status().state,'disconnected');
    await s.port.open(config(kind),1);await s.port.close('',1);assert.equal(api.isRegisteredNativeTransport(s.port,kind),true);
    factory.release(s.port);factory.release(s.port);assert.equal(api.isRegisteredNativeTransport(s.port,kind),false);
  }
  const direct=new api.NativeTcpTransport(socketEndpoint(),limits(),env);assert.equal(direct.nativeNetworkKind,'tcp');assert.equal(api.isRegisteredNativeTransport(direct,'tcp'),false);
  assert.equal(api.isRegisteredNativeTransport({simulationOnly:false,nativeNetworkKind:'tcp'},'tcp'),false);
});
for(const kind of ['tcp','udp','webSocket']){
  test(`${kind}: rejected close retains exact failed lifetime, repeated/unknown close cannot fabricate confirmation`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],factory=new api.NativeTransportFactory(s.env);sock.plan('close',business());
    await assert.rejects(s.port.close('',1),/closeFailed/);await settle();
    for(let i=0;i<5;i++){await assert.rejects(s.port.close('',1),/closeFailed/);await assert.rejects(s.port.close('',2),code('unknownCloseGeneration'));}
    assert.equal(sock.count('close'),1);assert.equal(s.port.status().closeConfirmed,false);assert.equal(s.port.status().quarantined,true);
    for(let generation=2;generation<12;generation++)await assert.rejects(s.port.open(config(kind),generation),/closeFailed/);
    assert.equal(s.env.sockets.length,1);assert.throws(()=>factory.release(s.port),code('closeUnconfirmed'));
    assert.equal(api.isRegisteredNativeTransport(s.port,kind),true);assert.equal(sock.listenerCount(),0);assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: close timeout remains quarantined even after late native success`,async()=>{
    const s=await opened(kind),sock=s.env.sockets[0],wait=deferred();sock.plan('close',wait.promise);
    const closing=s.port.close('',1),rejection=assert.rejects(closing,code('closeTimeout'));await s.env.advanceTo(30);await rejection;
    wait.resolve(kind==='webSocket'?true:undefined);await settle();await assert.rejects(s.port.close('',1),code('closeTimeout'));
    await assert.rejects(s.port.open(config(kind),2),code('closeTimeout'));assert.equal(s.env.sockets.length,1);assert.equal(sock.count('close'),1);
    assert.equal(s.port.canRelease(),false);assert.equal(s.port.status().closeConfirmed,false);assert.equal(s.env.tasks.size,0);
  });
  test(`${kind}: release while active is rejected, successful exact close permits release and idempotent old close`,async()=>{
    const s=await opened(kind),factory=new api.NativeTransportFactory(s.env);assert.throws(()=>factory.release(s.port),code('closeUnconfirmed'));
    await assert.rejects(s.port.close('',2),code('unknownCloseGeneration'));assert.equal(s.port.status().state,'ready');assert.equal(s.env.sockets[0].count('close'),0);
    await s.port.close('',1);assert.equal(s.port.status().closeConfirmed,true);assert.equal(s.port.status().quarantined,false);factory.release(s.port);
    assert.equal(api.isRegisteredNativeTransport(s.port,kind),false);await s.port.close('',1);assert.equal(s.env.sockets[0].count('close'),1);
  });
}
for(const kind of ['tcp','udp']){
  test(`${kind}: native pending open blocks close confirmation; late open requires a second real successful close`,async()=>{
    const env=new Environment(),wait=deferred();env.plans.push(sock=>sock.plan(kind==='tcp'?'connect':'bind',wait.promise));const s=setup(kind,{env});
    const opening=s.port.open(config(kind),1),openingRejection=assert.rejects(opening,code('cancelled'));await settle();
    let confirmed=false;const closing=s.port.close('',1).then(()=>confirmed=true);await openingRejection;await settle();
    assert.equal(confirmed,false);assert.equal(s.port.status().closeConfirmed,false);assert.equal(env.sockets[0].count('close'),1);
    wait.resolve();await closing;assert.equal(env.sockets[0].count('close'),2);assert.equal(s.port.status().closeConfirmed,true);assert.equal(env.tasks.size,0);
  });
  test(`${kind}: failure on late-open second close is retained rather than reporting initial close success`,async()=>{
    const env=new Environment(),wait=deferred();env.plans.push(sock=>{sock.plan(kind==='tcp'?'connect':'bind',wait.promise);sock.plan('close',Promise.resolve());sock.plan('close',business());});const s=setup(kind,{env});
    const opening=s.port.open(config(kind),1),openingRejection=assert.rejects(opening,code('cancelled'));await settle();
    const closing=s.port.close('',1),closeRejection=assert.rejects(closing,/closeFailed/);await openingRejection;wait.resolve();await closeRejection;await settle();
    await assert.rejects(s.port.close('',1),/closeFailed/);assert.equal(env.sockets[0].count('close'),2);assert.equal(s.port.status().quarantined,true);assert.equal(s.port.canRelease(),false);
  });
  test(`${kind}: hung native open after accepted close times out to bounded quarantine; late cleanup cannot unlock`,async()=>{
    const env=new Environment(),wait=deferred();env.plans.push(sock=>sock.plan(kind==='tcp'?'connect':'bind',wait.promise));const s=setup(kind,{env});
    const opening=s.port.open(config(kind),1),openingRejection=assert.rejects(opening,code('cancelled'));await settle();
    const closing=s.port.close('',1),closeRejection=assert.rejects(closing,code('closeTimeout'));await openingRejection;await env.advanceTo(30);await closeRejection;
    await assert.rejects(s.port.open(config(kind),2),code('closeTimeout'));assert.equal(env.sockets.length,1);wait.resolve();await settle();
    await assert.rejects(s.port.close('',1),code('closeTimeout'));assert.equal(s.port.status().quarantined,true);assert.equal(s.port.canRelease(),false);assert.equal(env.tasks.size,0);
  });
}
test('WebSocket deferred request acceptance remains in close lifetime after detached open waiter rejects',async()=>{
  const env=new Environment(),wait=deferred();env.plans.push(sock=>{sock.autoOpen=false;sock.plan('connect',wait.promise);});const s=setup('webSocket',{env});
  const opening=s.port.open(config('webSocket'),1),openingRejection=assert.rejects(opening,code('cancelled'));await settle();
  let confirmed=false;const closing=s.port.close('',1).then(()=>confirmed=true);await openingRejection;await settle();assert.equal(confirmed,false);
  wait.resolve(true);await closing;assert.equal(env.sockets[0].count('close'),2);assert.equal(s.port.status().closeConfirmed,true);assert.equal(env.tasks.size,0);
});
test('WebSocket late old open quarantine never closes new socket but prevents false whole-port release',async()=>{
  const s=await opened('webSocket'),old=s.env.sockets[0],callback=[...old.listeners.get('open')][0];await s.port.close('',1);await s.port.open(config('webSocket'),2);
  callback(undefined,{});await settle();assert.equal(s.port.status().state,'ready');assert.equal(s.env.sockets[1].count('close'),0);
  assert.equal(s.port.status().quarantined,true);assert.equal(s.port.canRelease(),false);await assert.rejects(s.port.close('',2),code('closeUnconfirmed'));
  assert.throws(()=>new api.NativeTransportFactory(s.env).release(s.port),code('closeUnconfirmed'));assert.equal(api.isRegisteredNativeTransport(s.port,'webSocket'),true);
});
test('pure admission release predicate retains native identity through active and quarantined lifetimes',async()=>{
  const s=await opened('tcp');assert.equal(api.releaseNativeTransport(s.port),false);assert.equal(api.isRegisteredNativeTransport(s.port,'tcp'),true);
  s.env.sockets[0].plan('close',business());await assert.rejects(s.port.close('',1),/closeFailed/);await settle();
  assert.equal(api.releaseNativeTransport(s.port),false);assert.equal(api.isRegisteredNativeTransport(s.port,'tcp'),true);
  const safe=await opened('tcp');await safe.port.close('',1);assert.equal(api.releaseNativeTransport(safe.port),true);assert.equal(api.isRegisteredNativeTransport(safe.port,'tcp'),false);
});
