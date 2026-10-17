import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes, registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {OutputSettingsDraft}=await import('../entry/src/main/ets/output/OutputSettingsModel.ts');
const {OutputTargetCollection}=await import('../entry/src/main/ets/output/OutputTargetCollection.ts');
const {OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges}=await import('../entry/src/main/ets/settings/OutputConfiguration.ts');
export function createOutputOwner(factory, diagnosticOwner = { blocked() { return false; }, setForeground() {} }) {
 const source=readFileSync(new URL('../entry/src/main/ets/app/NativeOutputSession.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export class/gm,'class');
 return new Function('SocketDiagnosticSession','OutputSettingsDraft','createNativeOutputCoordinator','OutputTargetCollection','OutputConfiguration','SavedOutputTarget','SavedOutputDeviceRanges',stripTypeScriptTypes(source)+';return NativeOutputSession;')(diagnosticOwner,OutputSettingsDraft,factory,OutputTargetCollection,OutputConfiguration,SavedOutputTarget,SavedOutputDeviceRanges);
}
export function inertCoordinator() { return {setTerminalGateObserver(){},setForeground(){},disarm(){},status(){return null;},isBusy(){return false;},appliedConfigurationId(){return 0;},message(){return '';},refresh(){},stop(){},beginSourceSeek(){}}; }
