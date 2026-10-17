// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/input-shortcuts-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-input-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'), `import { LocalShortcutEngine, ShortcutInputContext, ShortcutDispatch } from '../input/LocalShortcutEngine';
import { KeyboardShortcutConfiguration, KeyboardShortcutMapping, ShortcutAction, defaultShortcutAction, shortcutActionCatalog, keyCatalog, chordLabel, validateShortcutConfiguration } from '../input/ShortcutConfiguration';
import { applyAxisShortcutAction, applySyncShortcutAction } from '../input/ShortcutSettingActions';
import { AxisConfiguration, SyncConfiguration } from '../core/AxisConfiguration';
import { DeviceAxisDefinition } from '../core/DeviceProfile';
@Entry
@Component
struct Index {
  private engine: LocalShortcutEngine = new LocalShortcutEngine();
  run(): void {
    const config = new KeyboardShortcutConfiguration();
    const mapping = new KeyboardShortcutMapping('fixture', 'SDK fixture');
    mapping.keys = [2017]; mapping.actions = [new ShortcutAction('Media::PlayPause::Toggle')];
    config.mappings = [mapping]; this.engine.setConfiguration(config);
    this.engine.setContext(new ShortcutInputContext());
    const events: ShortcutDispatch[] = this.engine.keyEvent({ keyCode: 2017, pressed: true }, 0);
    for (const event of events) { if (this.engine.isDispatchCurrent(event)) { this.engine.completeDispatch(event); } }
    this.engine.advance(100, this.engine.cancellationToken()); this.engine.reset('fixture');
    this.engine.dispatchAction(new ShortcutAction('App::Stop'));
    validateShortcutConfiguration(this.engine.configurationSnapshot());
    shortcutActionCatalog(); keyCatalog(); chordLabel([2017]);
    const axis = new AxisConfiguration(new DeviceAxisDefinition('L0'));
    applyAxisShortcutAction(axis, defaultShortcutAction('Axis::ScriptScale::Set'), 'L0', ['L0']);
    applySyncShortcutAction(new SyncConfiguration(), defaultShortcutAction('Sync::Duration::Set'));
  }
  build() { Column() { Button('SDK fixture only').onClick(() => this.run()); } }
}
`);
fs.writeFileSync(path.join(work,'entry/src/main/ets/entryability/EntryAbility.ets'), "import { UIAbility } from '@kit.AbilityKit';\nimport { window } from '@kit.ArkUI';\nexport default class EntryAbility extends UIAbility {\n  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }\n}\n");
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'input-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['ShortcutConfiguration.ts','ShortcutSettingActions.ts','ButtonShortcutState.ts','LocalShortcutEngine.ts'])if(!map.includes(name))throw Error('Input module not reachable: '+name);
console.log('PASS: real input imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
