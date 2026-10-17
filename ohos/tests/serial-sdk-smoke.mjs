// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/serial-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-serial-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'), `import { NativeSerialFactory } from '../output/serial/NativeSerialFactory';
import { OfficialSerial19Backend } from '../output/serial/OfficialSerial19Backend';
import { OfficialSerial26Backend } from '../output/serial/OfficialSerial26Backend';
import { Ch34xWriteOnlyBackend } from '../output/serial/Ch34xWriteOnlyBackend';
import { UsbCdcBackend } from '../output/serial/UsbCdcBackend';
import { SerialTransport } from '../output/serial/SerialTransport';
@Entry
@Component
struct Index {
  private factory: NativeSerialFactory = new NativeSerialFactory();
  private legacy: OfficialSerial19Backend = new OfficialSerial19Backend(0, 'compile-only');
  private modern: OfficialSerial26Backend = new OfficialSerial26Backend('compile-only');
  private ch34x: Ch34xWriteOnlyBackend = new Ch34xWriteOnlyBackend('compile-only');
  private cdc: UsbCdcBackend = new UsbCdcBackend('compile-only');
  private port: SerialTransport = new SerialTransport(this.cdc,
    { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', handshake: 'none', dtr: true, rts: true },
    { operationTimeoutMs: 250, closeTimeoutMs: 1000, maximumPayloadBytes: 8192, maximumReceiveBytes: 4096 },
    { nowMs: (): number => 0, schedule: (callback: () => void, delay: number): number => setTimeout(callback, delay), cancel: (id: number): void => clearTimeout(id) });
  build() { Column() { Text('Compile fixture only; no connect, permission, read or write'); Text(this.port.status().state); } }
}
`);
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'serial-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['SerialTransport.ts','CdcDescriptors.ts','NativeSerialFactory.ets','OfficialSerial19Backend.ets','OfficialSerial26Backend.ets','UsbCdcBackend.ets','Ch34xWriteOnlyBackend.ets','Ch34xProtocol.ts','SerialOwnershipLease.ts','Ch34xReadOnlyProbe.ets','SerialProbeTypes.ts'])if(!map.includes(name))throw Error('Serial module not reachable: '+name);
console.log('PASS: real serial imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
