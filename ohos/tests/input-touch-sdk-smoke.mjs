// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/input-touch-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-input-touch-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'), `import { InputSettingsPanel } from '../components/InputSettingsPanel';
import { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, defaultShortcutAction, shortcutActionCatalog } from '../input/ShortcutConfiguration';
@Entry
@Component
struct Index {
  @State configuration: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
  @State status: string = '';
  aboutToAppear(): void {
    const mapping: KeyboardShortcutMapping = new KeyboardShortcutMapping('fixture', 'Full DTO editor');
    mapping.keys = [2017];
    const action: ShortcutAction = defaultShortcutAction('Axis::MotionProvider::Set');
    action.targetAxis = 'L1'; action.text = 'Random';
    mapping.actions = [action, defaultShortcutAction('Media::Loop::Set')];
    const configuration: KeyboardShortcutConfiguration = new KeyboardShortcutConfiguration();
    configuration.mappings = [mapping]; this.configuration = configuration;
    this.status = 'Fixture catalog: ' + shortcutActionCatalog().length;
  }
  build() {
    Column() {
      InputSettingsPanel({ configuration: this.configuration, axisNames: ['L0', 'L1', 'R0'], enabledAxisNames: ['L0', 'L1'],
        selectedAxisName: 'L0', actionStatus: this.status,
        onChange: (next: KeyboardShortcutConfiguration): void => { this.configuration = next; },
        onAction: (action: ShortcutAction): void => { this.status = action.id + ' / ' + action.targetAxis + ' / ' + action.text; },
        onStop: (): void => { this.status = 'Stopped'; } })
    }
  }
}
`);
fs.writeFileSync(path.join(work,'entry/src/main/ets/entryability/EntryAbility.ets'), "import { UIAbility } from '@kit.AbilityKit';\nimport { window } from '@kit.ArkUI';\nexport default class EntryAbility extends UIAbility {\n  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }\n}\n");
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'input-touch-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['InputSettingsPanel.ets','CurvePointEditor.ets','ShortcutConfiguration.ts','KeyboardInputSession.ts'])if(!map.includes(name))throw Error('Touch editor module not reachable: '+name);
console.log('PASS: real full-DTO input editor imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
