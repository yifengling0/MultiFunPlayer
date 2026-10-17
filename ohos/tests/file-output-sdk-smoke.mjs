// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/file-output-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-recording-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'),"import { common } from '@kit.AbilityKit';\nimport { FileRecordingSession } from '../output/recording/FileRecordingSession';\nimport { NativeRecordingRoot } from '../output/recording/NativeRecordingRoot';\nimport { PlaybackSessionCore } from '../core/PlaybackSessionCore';\nimport { SettingsSchema } from '../settings/SettingsSchema';\n@Entry\n@Component\nstruct Index {\n  private source: PlaybackSessionCore = new PlaybackSessionCore(SettingsSchema.defaults());\n  private recorder: FileRecordingSession = new FileRecordingSession(this.source, { nowMs: (): number => 0 },\n    { maximumFrameAgeMs: 200, maximumObservationAgeMs: 200, allowPausedAutoHome: false, allowPausedMotion: false });\n  private async explicitTestStart(): Promise<void> {\n    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;\n    const root = await NativeRecordingRoot.prepare(context);\n    await this.recorder.start(root, { format: 'funscript', name: 'sdk_smoke', axisRanges: [{ axisId: 'L0', minimum: 0, maximum: 1, enabled: true }] });\n    await this.recorder.stop();\n  }\n  build() { Column() { Text(this.recorder.snapshot().state); Button('SDK fixture only').onClick(() => { this.explicitTestStart(); }); } }\n}\n");
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'recording-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['FileRecordingSession.ts','RecordingCodec.ts','RecordingPort.ts','NativeRecordingRoot.ets'])if(!map.includes(name))throw Error('Recording module not reachable: '+name);
console.log('PASS: real recording imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
