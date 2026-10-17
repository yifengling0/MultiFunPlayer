// Official SDK declaration + ArkTS probe only. This does not assemble an HAP.
// MFP_SDK_TOOLS=/path/to/command-line-tools node tests/readable-settings-sdk-probe.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const tools = process.env.MFP_SDK_TOOLS;
if (!tools || !path.isAbsolute(tools)) throw Error('MFP_SDK_TOOLS must name the installed official command-line-tools directory.');
const sdk = path.join(tools, 'sdk/default/openharmony/ets');
const loader = path.join(sdk, 'build-tools/ets-loader');
const ts = createRequire(import.meta.url)(path.join(loader, 'node_modules/typescript'));
const root = fileURLToPath(new URL('../entry/src/main/ets', import.meta.url));
const config = ts.readConfigFile(path.join(loader, 'tsconfig.json'), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, loader);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfp-readable-types-'));
const options = { ...parsed.options, strict: true, noEmit: true, skipLibCheck: true,
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020, moduleResolution: ts.ModuleResolutionKind.NodeJs,
  baseUrl: root, paths: { '@kit.*': [path.join(sdk, 'kits/@kit.*.d.ts')], '@*': [path.join(sdk, 'api/@*.d.ts')] },
  allowNonTsExtensions: true, incremental: true, tsBuildInfoFile: path.join(temp, 'probe.tsbuildinfo') };
const declarations = path.join(loader, 'declarations');
const components = path.join(root, 'components');
const roots = [...fs.readdirSync(declarations).filter(name => name.endsWith('.d.ts')).map(name => path.join(declarations, name)),
  ...fs.readdirSync(components).filter(name => name.endsWith('.ets')).map(name => path.join(components, name))];
const program = ts.createIncrementalProgram({ rootNames: roots, options });
const types = ts.getPreEmitDiagnostics(program.getProgram());
const lint = ts.ArkTSLinter_1_1.runArkTSLinter(program, undefined, () => {}, 'ArkTS_1_1');
const diagnostics = types.concat(lint);
for (const item of diagnostics) {
  const location = item.file ? item.file.getLineAndCharacterOfPosition(item.start ?? 0) : null;
  console.log((item.file ? `${item.file.fileName}:${location.line + 1}:${location.character + 1}: ` : '') +
    ts.DiagnosticCategory[item.category] + ': ' + ts.flattenDiagnosticMessageText(item.messageText, '\n'));
}
const errors = diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error);
console.log(`Component SDK probe: ${errors.length} errors; ${diagnostics.length - errors.length} other diagnostics; ${lint.length} ArkTS lint diagnostics.`);
if (errors.length) process.exitCode = 1;
