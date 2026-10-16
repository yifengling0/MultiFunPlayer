import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? s+'.ts' : s,c); } });
const { SettingsSchema } = await import('../entry/src/main/ets/settings/SettingsSchema.ts');
const { SettingsStore } = await import('../entry/src/main/ets/settings/SettingsStore.ts');
const source=readFileSync(new URL('../entry/src/main/ets/settings/NativeSettingsStore.ets',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'').replace(/export class /g,'class '));
const failure=(code,message)=>Object.assign(new Error(message),{code});
const encoded=offset=>{const c=SettingsSchema.defaults();c.globalOffsetSeconds=offset;return SettingsSchema.encode(c);};
const root='/data/storage/el2/base/haps/entry/files'; const primary=root+'/configuration.json'; const backup=root+'/configuration.backup.json';
function setup(contents={}) {
  const tree=new Map(Object.entries(contents).map(([path,value])=>[path,{bytes:Buffer.from(value),type:'file'}]));
  const handles=new Map();const calls=[];let next=0;
  const state={shortWrite:Infinity,shortRead:Infinity,failOpen:null,failRename:null,failFsync:false,failWrite:false,zeroWrite:false,closeFailure:null,failUnlink:false};
  const stat=node=>({size:node.bytes.length,isFile:()=>node.type==='file'});
  const fileIo={
    OpenMode:{READ_ONLY:0,WRITE_ONLY:1,CREATE:2,TRUNC:4,NOFOLLOW:8,NONBLOCK:16},
    async open(path,mode){calls.push(['open',path,mode]);if(state.failOpen)throw state.failOpen;
      let node=tree.get(path); if(!node && (mode&2)){node={bytes:Buffer.alloc(0),type:'file'};tree.set(path,node);}
      if(!node)throw failure(13900002,'Missing');if(node.type==='link'&&(mode&8))throw failure(13900033,'Symlink');
      if(mode&4)node.bytes=Buffer.alloc(0);const file={fd:++next};handles.set(file.fd,{node,position:0,path});return file;},
    async stat(fd){calls.push(['stat',fd]);return stat(handles.get(fd).node);},
    async read(fd,buffer){calls.push(['read',fd]);const h=handles.get(fd);const n=Math.min(buffer.byteLength,h.node.bytes.length-h.position,state.shortRead);
      new Uint8Array(buffer).set(h.node.bytes.subarray(h.position,h.position+n));h.position+=n;return n;},
    async write(fd,buffer){calls.push(['write',fd]);if(state.failWrite)throw failure(13900025,'No space left');if(state.zeroWrite)return 0;
      const h=handles.get(fd),n=Math.min(buffer.byteLength,state.shortWrite);h.node.bytes=Buffer.concat([h.node.bytes,Buffer.from(buffer).subarray(0,n)]);h.position+=n;return n;},
    async fsync(fd){calls.push(['fsync',fd]);if(state.failFsync)throw failure(13900005,'Sync failed');},
    async close(file){calls.push(['close',file.fd]);if(state.closeFailure==='before')throw failure(13900005,'Close failed');assert.ok(handles.delete(file.fd));if(state.closeFailure==='after')throw failure(13900005,'Close result unknown');},
    async rename(from,to){calls.push(['rename',from,to]);if(to===state.failRename)throw failure(13900012,'Permission denied');
      const node=tree.get(from);assert.ok(node);tree.set(to,node);tree.delete(from);},
    async unlink(path){calls.push(['unlink',path]);if(state.failUnlink)throw failure(13900012,'Cleanup denied');tree.delete(path);}
  };
  const util={TextEncoder:class{encodeInto(text){return new TextEncoder().encode(text);}},TextDecoder:{create:(enc,opts)=>({decodeToString:bytes=>new TextDecoder(enc,opts).decode(bytes)})}};
  const constructors=new Function('fileIo','util','SettingsSchema','SettingsStore',js+'\nreturn {NativeSettingsStore,NativeSettingsStorePort};')(fileIo,util,SettingsSchema,SettingsStore);
  return {...constructors,tree,handles,calls,state,text:path=>tree.get(path)?.bytes.toString('utf8')};
}

test('native read is bounded, handles short UTF-8 reads, closes FDs and never scans',async()=>{
  const json=encoded(2);const s=setup({[primary]:json});s.state.shortRead=17;const port=new s.NativeSettingsStorePort(root);
  assert.equal(await port.read('primary'),json);assert.equal(await port.read('backup'),null);assert.equal(s.handles.size,0);
  assert.ok(s.calls.every(([op])=>['open','stat','read','close'].includes(op)));
  assert.ok(s.calls.filter(([op])=>op==='open').every(([,path,mode])=>path.startsWith(root+'/')&&(mode&8)&&(mode&16)));
});

test('native ENOENT is distinct from denied access, malformed UTF8 and special files',async()=>{
  const s=setup();const port=new s.NativeSettingsStorePort(root);assert.equal(await port.read('primary'),null);
  s.state.failOpen=failure(13900012,'denied');await assert.rejects(port.read('primary'),/permission denied.*13900012/);
  s.state.failOpen=null;s.tree.set(primary,{bytes:Buffer.from([0xff]),type:'file'});await assert.rejects(port.read('primary'));
  s.tree.set(primary,{bytes:Buffer.from('x'),type:'directory'});await assert.rejects(port.read('primary'),/regular/);
  assert.equal(s.handles.size,0);
});

test('native commits fsynced complete temp files and preserves last validated backup with short writes',async()=>{
  const old=encoded(1),next=encoded(2);const s=setup({[primary]:'corrupted original'});s.state.shortWrite=113;
  const port=new s.NativeSettingsStorePort(root);await port.writeAtomic(next,old);
  assert.equal(s.text(primary),next);assert.equal(s.text(backup),old);assert.equal(s.handles.size,0);
  const renames=s.calls.filter(([op])=>op==='rename');assert.deepEqual(renames.map(c=>c[2]),[backup,primary]);
  for(const [,,target] of renames){const index=s.calls.findIndex(c=>c[0]==='rename'&&c[2]===target);
    assert.equal(s.calls[index-1][0],'close');assert.equal(s.calls[index-2][0],'fsync');}
  assert.ok(!s.calls.some(([op,path])=>op==='unlink'&&(path===primary||path===backup)));
});

test('rename failure preserves old primary and backup and reports failure without delete-replace fallback',async()=>{
  const old=encoded(1),next=encoded(2);const s=setup({[primary]:old});s.state.failRename=primary;
  const port=new s.NativeSettingsStorePort(root);await assert.rejects(port.writeAtomic(next,old),/permission denied/);
  assert.equal(s.text(primary),old);assert.equal(s.text(backup),old);assert.equal(s.handles.size,0);
  assert.equal(s.text(primary+'.pending'),undefined);assert.ok(!s.calls.some(([op,path])=>op==='unlink'&&path===primary));
  s.state.failRename=null;await port.writeAtomic(next,old);assert.equal(s.text(primary),next);
});

test('sync, disk-full and zero-byte write failures never claim success or replace target',async()=>{
  for(const flag of ['failFsync','failWrite','zeroWrite']){
    const old=encoded(1);const s=setup({[primary]:old});s.state[flag]=true;const port=new s.NativeSettingsStorePort(root);
    await assert.rejects(port.writeAtomic(encoded(2),old));assert.equal(s.text(primary),old);assert.equal(s.handles.size,0);
    assert.ok(!s.calls.some(([op])=>op==='rename'));assert.ok(![...s.tree.keys()].some(path=>path.endsWith('.pending')));
  }
});

test('native IO rejects invalid/newer snapshots before access and refuses unsafe roots',async()=>{
  const s=setup();const port=new s.NativeSettingsStorePort(root);
  for(const json of ['bad','{"schemaVersion":8}'])await assert.rejects(port.writeAtomic(json,null));
  await assert.rejects(port.writeAtomic(encoded(2),'bad'));assert.equal(s.calls.length,0);
  for(const path of ['/','../settings','file://user/foo','/data/../public','/data/token?q=1'])assert.throws(()=>new s.NativeSettingsStorePort(path));
});

test('store/native end-to-end restart restores config but does not restore runtime/arm state',async()=>{
  const s=setup();const store=new s.NativeSettingsStore(root,0);await store.load();const c=SettingsSchema.defaults();
  c.globalOffsetSeconds=5;c.playing=true;c.armed=true;assert.equal((await store.save(c)).status,'saved');
  const restarted=new s.NativeSettingsStore(root,0);const loaded=await restarted.load();assert.equal(loaded.configuration.globalOffsetSeconds,5);
  assert.equal(loaded.configuration.armed,undefined);assert.equal(loaded.configuration.playing,undefined);
  assert.equal(loaded.source,'primary');assert.equal(loaded.recoveryRequired,false);
});

test('native entrypoint canonicalizes direct caller JSON and drops runtime flags and secrets',async()=>{
  const s=setup();const port=new s.NativeSettingsStorePort(root);
  await port.writeAtomic('{"armed":true,"token":"new-secret"}','{"playing":true,"token":"old-secret"}');
  for(const path of [primary,backup]){
    assert.equal(SettingsSchema.decode(s.text(path)).status,'valid');
    assert.ok(!/secret|"armed"|"playing"|"token"/.test(s.text(path)));
  }
});

test('close failures block commit, still clean staging, and never retry an indeterminate descriptor',async()=>{
  for(const phase of ['before','after']){
    const old=encoded(1);const s=setup({[primary]:old});s.state.closeFailure=phase;
    const port=new s.NativeSettingsStorePort(root);await assert.rejects(port.writeAtomic(encoded(2),null),/Close/);
    assert.equal(s.text(primary),old);assert.equal(s.text(primary+'.pending'),undefined);
    assert.equal(s.calls.filter(([op])=>op==='close').length,1);
    assert.equal(s.calls.filter(([op])=>op==='rename').length,0);
  }
});

test('cleanup failures preserve original errors and are visible, including read cleanup',async()=>{
  const old=encoded(1);const s=setup({[primary]:old});s.state.failWrite=true;s.state.closeFailure='after';
  s.state.failUnlink=true;const port=new s.NativeSettingsStorePort(root);
  await assert.rejects(port.writeAtomic(encoded(2),null),error=>/No space left/.test(error.message)&&/handle cleanup/.test(error.message)&&/temporary file/.test(error.message));
  assert.equal(s.text(primary),old);assert.ok(s.calls.some(([op])=>op==='unlink'));
  const read=setup();read.tree.set(primary,{bytes:Buffer.from([0xff]),type:'file'});read.state.closeFailure='after';
  await assert.rejects(new read.NativeSettingsStorePort(root).read('primary'),error=>/Cannot read primary/.test(error.message)&&/read-handle cleanup/.test(error.message));
});
