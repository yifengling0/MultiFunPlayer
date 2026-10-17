// Isolated actual SDK reachability smoke. Never edits the shared app Index.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/shortcut-motion-sdk-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const tools=process.env.MFP_SDK_TOOLS;
if(!tools||!path.isAbsolute(tools))throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-shortcut-motion-sdk-'));
fs.cpSync(project,work,{recursive:true,filter:p=>!['build','.hvigor','tests','tools','node_modules','oh_modules'].includes(path.basename(p))});
fs.writeFileSync(path.join(work,'entry/src/main/ets/pages/Index.ets'), `import { MotionProviderConfiguration } from '../core/MotionConfiguration';
import { MotionRegistry } from '../core/motion/MotionRegistry';
import { ShortcutAction, defaultShortcutAction, shortcutActionCatalog, KeyboardShortcutConfiguration, KeyboardShortcutMapping } from '../input/ShortcutConfiguration';
import { MotionShortcutResult, applyMotionShortcutAction, motionShortcutProviderId } from '../input/ShortcutMotionActions';
@Entry
@Component
struct Index {
  @State status: string = '';
  run(): void {
    const registry = new MotionRegistry(['L0', 'R0']);
    for (const spec of shortcutActionCatalog()) {
      const provider = motionShortcutProviderId(spec.id);
      if (provider === null) { continue; }
      const action = defaultShortcutAction(spec.id);
      const result: MotionShortcutResult | null = applyMotionShortcutAction(new MotionProviderConfiguration(provider), action, 'L0', ['L0', 'R0']);
      if (result !== null) {
        if (result.resetCustomCurve) { registry.resetCustomCurve('L0', result.resetSync); }
        else { registry.configureProvider('L0', result.settings); }
        this.status = result.summary;
      }
    }
    const config = new KeyboardShortcutConfiguration();
    const mapping = new KeyboardShortcutMapping('fixture', 'Exact target');
    mapping.actions = [new ShortcutAction('Shortcut::Enabled::Set', 1, '', 0, 'Exact target'),
      new ShortcutAction('Internal::Playlist::PlayByName', 0, '', 0, 'folder/clip.funscript')];
    config.mappings = [mapping]; KeyboardShortcutConfiguration.clone(config);
  }
  build() { Column() { Button('Motion shortcut SDK fixture').onClick(() => this.run()); Text(this.status); } }
}
`);
fs.writeFileSync(path.join(work,'entry/src/main/ets/entryability/EntryAbility.ets'), "import { UIAbility } from '@kit.AbilityKit';\nimport { window } from '@kit.ArkUI';\nexport default class EntryAbility extends UIAbility {\n  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }\n}\n");
fs.mkdirSync(path.join(work,'node_modules/@ohos'),{recursive:true});
for(const name of ['hvigor','hvigor-ohos-plugin'])fs.symlinkSync(path.join(tools,'hvigor',name),path.join(work,'node_modules/@ohos',name));
const env={...process.env,JAVA_TOOL_OPTIONS:'-Xmx256m',DEVECO_HOME:tools,DEVECO_SDK_HOME:path.join(tools,'sdk'),DEVECO_NODE_HOME:path.join(tools,'tool/node'),HVIGOR_USER_HOME:path.join(work,'hvigor-home'),NODE_PATH:path.join(work,'node_modules'),PATH:path.join(tools,'tool/node/bin')+':'+path.join(tools,'bin')+':'+process.env.PATH};
const result=spawnSync(path.join(tools,'tool/node/bin/node'),[path.join(tools,'hvigor/hvigor/bin/hvigor.js'),'assembleHap','--mode','module','-p','product=default','-p','buildMode=debug','--no-daemon','--no-parallel','--optimization-strategy','memory','--max-old-space-size','512'],{cwd:work,env,encoding:'utf8'});
fs.writeFileSync(path.join(work,'shortcut-motion-sdk.log'),(result.stdout||'')+(result.stderr||''));
console.log(work);console.log(result.stdout);console.error(result.stderr);
if(result.status!==0)process.exit(result.status||1);
const map=fs.readFileSync(path.join(work,'entry/build/default/outputs/default/mapping/sourceMaps.map'),'utf8');
for(const name of ['ShortcutConfiguration.ts','ShortcutMotionActions.ts','MotionConfiguration.ts','MotionRegistry.ts'])if(!map.includes(name))throw Error('Motion shortcut module not reachable: '+name);
console.log('PASS: real Motion shortcut catalog, pure reducer and registry imports are reachable; unsigned HAP is an isolated fixture, not the shipping app.');
