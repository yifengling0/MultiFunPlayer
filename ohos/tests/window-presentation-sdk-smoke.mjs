// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/window-presentation-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-window-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'),"import { NativeWindowPresentation } from '../presentation/NativeWindowPresentation';\n@Entry\n@Component\nstruct Index {\n  build() { Column() { Button('SDK fixture only').onClick(() => { NativeWindowPresentation.request(true); }); } }\n}\n");
fs.writeFileSync(path.join(work,'entry/src/main/ets/entryability/EntryAbility.ets'),"import { UIAbility } from '@kit.AbilityKit';\nimport { window } from '@kit.ArkUI';\nimport { NativeWindowPresentation } from '../presentation/NativeWindowPresentation';\nexport default class EntryAbility extends UIAbility {\n  async onWindowStageCreate(stage: window.WindowStage): Promise<void> {\n    await NativeWindowPresentation.attachStage(stage);\n    await stage.loadContent('pages/Index');\n  }\n  onBackground(): void { NativeWindowPresentation.setForeground(false); }\n  onForeground(): void { NativeWindowPresentation.setForeground(true); }\n  onWindowStageDestroy(): void { NativeWindowPresentation.destroyStage(); }\n}\n");
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'window-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['WindowPresentation.ts','NativeWindowPresentation.ets'])if(!map.includes(name))throw Error('Presentation module not reachable: '+name);
console.log('PASS: real presentation imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
