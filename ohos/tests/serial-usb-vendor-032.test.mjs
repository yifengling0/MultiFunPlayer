import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { usbVendorChip, usbVendorInitialization, ftdiRBaudDivisor } from '../entry/src/main/ets/output/serial/UsbVendorProtocol.ts';

const attrs = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none', dtr: true, rts: false };
// Independent wire vectors from CP210x AN571 / Linux cp210x, FTDI divisor encoding.
test('CP2102 sends interface-indexed LE32 baud, 8N1 and 16-byte manual flow', () => {
  const c = usbVendorInitialization('cp210x', attrs, 3);
  assert.deepEqual(c.map(x => [x.requestType,x.request,x.value,x.index,x.data]), [
    [0x41,0,1,3,[]], [0x41,0x1e,0,3,[0,0xc2,1,0]], [0x41,3,0x800,3,[]],
    [0x41,0x13,0,3,[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]], [0x41,7,0x301,3,[]]
  ]);
});
test('FT232R fractional baud golden vectors and 17th divisor bit', () => {
  for (const [baud,encoded] of [[9600,0x4138],[115200,26],[460800,0x4006],[921600,0x8003],[1152000,0x14002],[2000000,1],[3000000,0]]) {
    assert.equal(ftdiRBaudDivisor(baud),encoded,`baud ${baud}`);
    const c=usbVendorInitialization('ftdi',{...attrs,baudRate:baud})[1];
    assert.deepEqual([c.value,c.index],[encoded&0xffff,encoded>>>16]);
  }
  for (const rate of [0,299,2500000,4000000,NaN]) assert.throws(()=>ftdiRBaudDivisor(rate));
});
test('all explicit line combinations set both masks and CP flow agrees',()=>{
  for(const [dtr,rts,value] of [[false,false,0x300],[true,false,0x301],[false,true,0x302],[true,true,0x303]]) {
    assert.equal(usbVendorInitialization('ftdi',{...attrs,dtr,rts})[4].value,value);
    const c=usbVendorInitialization('cp210x',{...attrs,dtr,rts});
    assert.equal(c[4].value,value); assert.equal(c[3].data[0],dtr?1:0); assert.equal(c[3].data[4],rts?0x40:0);
  }
});
test('only candidate IDs and conservative attributes/rates admitted',()=>{
  assert.equal(usbVendorChip(0x10c4,0xea60),'cp210x'); assert.equal(usbVendorChip(0x0403,0x6001),'ftdi');
  for(const pid of [0xea70,0xea71,0xea80]) assert.equal(usbVendorChip(0x10c4,pid),null);
  for(const pid of [0x6010,0x6011,0x6014,0x6015]) assert.equal(usbVendorChip(0x0403,pid),null);
  for(const patch of [{dataBits:7},{dtr:null},{baudRate:4000000}]) assert.throws(()=>usbVendorInitialization('cp210x',{...attrs,...patch}));
  assert.throws(()=>usbVendorInitialization('ftdi',attrs,1));
});

const source=name=>readFileSync(new URL(`../entry/src/main/ets/output/serial/${name}`,import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace(/\bexport /g,'');
function setup(chip='cp210x',id=0){
  const calls=[];let transfer; const iface={id,clazz:255,alternateSetting:0,endpoints:[{address:2,direction:0,interfaceId:id,type:2,attributes:2,number:2,maxPacketSize:64}]};
  const device={name:'selected',productName:'fixture',vendorId:chip==='cp210x'?0x10c4:0x0403,productId:chip==='cp210x'?0xea60:0x6001,configs:[{interfaces:[iface]}]};
  const raw=new Uint8Array([18,1,0,2,0,0,0,64,device.vendorId&255,device.vendorId>>>8,device.productId&255,device.productId>>>8,0,6,0,0,0,1]);
  const usb={getDevices:()=>[device],hasRight:()=>false,requestRight:async()=>{calls.push(['permission']);return true;},connectDevice:()=>{calls.push(['connect']);return {};},getRawDescriptor:()=>raw,
    claimInterface:(_p,i,force)=>{calls.push(['claim',i.id,force]);return 0;},
    usbControlTransfer:async(_p,c,t)=>{calls.push(['control',c,t]);if(c.bRequest===0xff)c.data[0]=2;return c.wLength;},
    usbSubmitTransfer:t=>{transfer=t;calls.push(['submit']);},usbCancelTransfer:()=>{calls.push(['cancel']);},releaseInterface:()=>{calls.push(['release']);return 0;},closePipe:()=>{calls.push(['close']);return 0;},
    UsbTransferFlags:{USB_TRANSFER_SHORT_NOT_OK:0},UsbEndpointTransferType:{TRANSFER_TYPE_BULK:2},UsbTransferStatus:{TRANSFER_COMPLETED:0}};
  const api=new Function('usbManager',stripTypeScriptTypes(source('UsbVendorProtocol.ts')+'\n'+source('UsbVendorWriteOnlyBackend.ets'))+'\nreturn {UsbVendorWriteOnlyBackend,listUsbVendorPorts};')(usb);
  return {usb,raw,calls,device,...api,backend:new api.UsbVendorWriteOnlyBackend('selected',chip),get transfer(){return transfer;}};
}
const sink={live:()=>true,received:()=>assert.fail('write-only'),fault:()=>{}};
test('actual CP backend preserves payload/length/interface and probes before UART writes',async()=>{
  const s=setup('cp210x',3); await s.backend.open(attrs,sink,250);
  const c=s.calls.filter(x=>x[0]==='control').map(x=>x[1]);
  assert.deepEqual([c[0].bmRequestType,c[0].bRequest,c[0].wValue,c[0].wIndex,c[0].wLength],[0xc0,0xff,0x370b,3,1]);
  assert.deepEqual([c[2].wValue,c[2].wIndex,c[2].wLength,Array.from(c[2].data)],[0,3,4,[0,0xc2,1,0]]);
  assert.equal(c[3].wValue,0x800);assert.equal(c[4].wLength,16); assert.equal(c[5].wValue,0x301);
  assert.deepEqual(s.calls.find(x=>x[0]==='claim'),['claim',3,false]);await s.backend.close();
});
test('actual FT232R backend forwards divisor high bit and explicit line masks',async()=>{
  const s=setup('ftdi');await s.backend.open({...attrs,baudRate:1152000},sink,250);
  const c=s.calls.filter(x=>x[0]==='control').map(x=>x[1]);
  assert.deepEqual([c[1].wValue,c[1].wIndex,c[1].wLength],[0x4002,1,0]);assert.equal(c[4].wValue,0x301);await s.backend.close();
});
test('unknown silicon, descriptor mismatch, permission denial and cancelled permission send no UART writes',async()=>{
  for(const mode of ['cpPart','ftVersion','descriptor','denied','cancelled']) {
    const s=setup(mode==='ftVersion'?'ftdi':'cp210x');
    if(mode==='cpPart')s.usb.usbControlTransfer=async(_p,c)=>{s.calls.push(['control',c]);c.data[0]=0x20;return 1;};
    if(mode==='ftVersion')s.raw[13]=9;if(mode==='descriptor')s.raw[8]=0;
    if(mode==='denied')s.usb.requestRight=async()=>false;
    if(mode==='cancelled')s.usb.requestRight=async()=>{s.backend.stop();return true;};
    await assert.rejects(s.backend.open(attrs,sink,250));
    assert(!s.calls.some(x=>x[0]==='control' && (x[1].bmRequestType&128)===0));await s.backend.close();
  }
});
test('short baud/flow control completion rejects initialization',async()=>{
  for(const request of [0x1e,0x13]){const s=setup();const original=s.usb.usbControlTransfer;s.usb.usbControlTransfer=async(p,c,t)=>c.bRequest===request?c.wLength-1:original(p,c,t);
    await assert.rejects(s.backend.open(attrs,sink,250),/usbVendorControlFailed/);await s.backend.close();}
});
test('partial writes are exact; close waits cancelled native callback; reconnect uses new transfer',async()=>{
  const s=setup();await s.backend.open(attrs,sink,250);
  const bytes=new Uint8Array([1,2,3]);const first=s.backend.write(bytes,20);bytes.fill(9);assert.deepEqual(s.transfer.buffer,new Uint8Array([1,2,3]));
  s.transfer.callback(null,{status:0,actualLength:1});assert.equal(await first,1);
  const pending=s.backend.write(new Uint8Array([2,3]),20);const rejection=assert.rejects(pending);const closing=s.backend.close();await Promise.resolve();assert(!s.calls.some(x=>x[0]==='release'));
  s.transfer.callback(null,{status:3,actualLength:1});await rejection;await closing;
  await s.backend.open(attrs,sink,250);const next=s.backend.write(new Uint8Array([4]),20);s.transfer.callback(null,{status:0,actualLength:1});assert.equal(await next,1);await s.backend.close();
});
test('claim/connect failure and stop during part query cannot reach UART initialization',async()=>{
  for(const mode of ['claim','connect','partCancel']) {
    const s=setup();
    if(mode==='claim')s.usb.claimInterface=()=>-1;
    if(mode==='connect')s.usb.connectDevice=()=>undefined;
    if(mode==='partCancel')s.usb.usbControlTransfer=async(_p,c)=>{s.calls.push(['control',c]);c.data[0]=2;s.backend.stop();return 1;};
    await assert.rejects(s.backend.open(attrs,sink,250));await s.backend.close();
    assert(!s.calls.some(x=>x[0]==='control'&&(x[1].bmRequestType&128)===0));
    assert(!s.calls.some(x=>x[0]==='release') || mode==='partCancel');
  }
});
test('timed out/failed OUT never acknowledges an uncertain accepted prefix or retries',async()=>{
  for(const status of [1,2,3,5]){const s=setup();await s.backend.open(attrs,sink,250);
    const pending=s.backend.write(new Uint8Array([1,2]),20);s.transfer.callback(null,{status,actualLength:1});await assert.rejects(pending,/UnknownPrefix/);
    assert.equal(s.calls.filter(x=>x[0]==='submit').length,1);await s.backend.close();}
});
