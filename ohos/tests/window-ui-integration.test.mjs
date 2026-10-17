import { SettingsDraftOwner } from '../entry/src/main/ets/presentation/SettingsDraftOwner.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
registerHooks({
  resolve(s,c,next) {
    if(s==='@kit.BasicServicesKit') return {url:'data:text/javascript,export const deviceInfo={deviceType:"2in1"};',shortCircuit:true};
    if(s==='@kit.ArkUI') return {url:'data:text/javascript,export const window={MaximizePresentation:{ENTER_IMMERSIVE:2,EXIT_IMMERSIVE:1}};',shortCircuit:true};
    if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)) return next(s+'.ts',c);
    return next(s,c);
  },
  load(url,c,next) {
    if(url.endsWith('NativeWindowPresentation.ets')) return {format:'module-typescript',source:fs.readFileSync(new URL(url),'utf8').replace('PresentationSnapshot, PresentationWindow,', 'PresentationSnapshot,'),shortCircuit:true};
    return next(url,c);
  }
});
const {NativeWindowPresentation:N}=await import('../entry/src/main/ets/presentation/NativeWindowPresentation.ets');
const {SerialDiagnosticSession}=await import('../entry/src/main/ets/app/SerialDiagnosticSession.ts');
const {KeyboardInputSession}=await import('../entry/src/main/ets/app/KeyboardInputSession.ts');
const {LocalShortcutEngine}=await import('../entry/src/main/ets/input/LocalShortcutEngine.ts');
const {KeyboardShortcutConfiguration}=await import('../entry/src/main/ets/input/ShortcutConfiguration.ts');
const {GeneralConfiguration}=await import('../entry/src/main/ets/settings/GeneralConfiguration.ts');
const {ErrorPresentation}=await import('../entry/src/main/ets/presentation/GeneralPresentation.ts');
const pageSource=fs.readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
const abilitySource=fs.readFileSync(new URL('../entry/src/main/ets/entryability/EntryAbility.ets',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export default class','class');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
class Handle {
 mode=4; immersive=false; calls=[];
 getWindowStatus(){return this.mode;} getImmersiveModeEnabledState(){return this.immersive;}
 async maximize(p){this.calls.push(['maximize',p]);if(this.wait)await this.wait;this.mode=p===2?1:2;this.immersive=p===2;}
 async recover(){this.calls.push(['recover']);this.mode=4;}
 setImmersiveModeEnabledState(value){this.immersive=value;}
 on(_name,callback){this.listener=callback;}
}
function ability(options={}) {
 const calls=[];
 const playback={initialize:options.initialize||(()=>Promise.resolve()),flushIfReady(){calls.push(['flush']);}};
 const output={setForeground(value){calls.push(['output',value]);},closeIfReady(){calls.push(['close']);}};
 const Ability=new Function('NativeKeyboardWindow','UIAbility','NativeOutputSession','AppStorage','PlaybackSession','NativeWindowPresentation','RemoteMediaSession',stripTypeScriptTypes(abilitySource)+';return EntryAbility;')({claimStage(){return 1;},bindStage(){},setForeground(){},releaseStage(){}},class{},output,{setOrCreate(_name,value){calls.push(['storage',value]);}},playback,N,{closeIfReady(){}});
 const app=new Ability();app.context={filesDir:'/owned/private'};return {app,calls};
}
function method(name) {
 const plain=pageSource.indexOf('  '+name+'(');const start=plain>=0?plain:pageSource.indexOf('  private '+name+'(');assert.ok(start>=0,name);
 const body=pageSource.indexOf('{',start);let depth=1,end=body+1;
 for(;depth>0&&end<pageSource.length;end++){if(pageSource[end]==='{')depth++;else if(pageSource[end]==='}')depth--;}
 return pageSource.slice(start,end);
}
function page() {
 KeyboardInputSession.setWindowFocus(KeyboardInputSession.claimWindow(),true);
 const calls=[];
 const methods=['remoteSource','closeConfirmation','aboutToAppear','aboutToDisappear','foregroundChanged','updateKeyboardContext','retireShortcutWorker','cancelManagedReload','cancelKeyboardWork','presentationChanged','cancelVideoChromeTimer','setVideoFullscreen','onBackPress','exitFullscreenWithKey'].map(method).join('\n');
 const Page=new Function('ImmersiveMaterialManager','SettingsDraftOwner','SerialDiagnosticSession','SocketDiagnosticSession','NativeWindowPresentation','NativeOutputSession','systemDateTime','setInterval','clearInterval','KeyCode','KeyboardInputSession','RemoteMediaSession',stripTypeScriptTypes('class Page{'+methods+'}')+';return Page;')({initialize:async()=>{}},SettingsDraftOwner,SerialDiagnosticSession,{claimOwner(){return 1;},releaseOwner(){}},N,{setForeground(v){calls.push(['outputForeground',v]);},restore(){}},{TimeType:{STARTUP:1},getUptime(){return 1;}},()=>1,()=>{}, {KEYCODE_ESCAPE:2070},KeyboardInputSession,{current(){return {subscribe(){return ()=>{};},snapshot(){return {};}};}});
 const p=new Page();p.selectScreen=screen=>{p.currentScreen=screen;};p.currentScreen='player';p.libraryOpeningRevision=-1;p.cancelLibraryPlayback=()=>{};p.continuous={setConfiguration(){}};p.cancelContinuousInput=()=>{};p.updateContinuousContext=()=>{};p.settingsDraftOwner=new SettingsDraftOwner();p.settingsDraftEpoch=0;p.serialDiscovery={cancel(){}};Object.assign(p,{confirmationOwner:null,confirmationErrorId:0,confirmationCloseUnconfirmed:false,keyboard:new LocalShortcutEngine(),shortcutQueue:Promise.resolve(),keyboardOwner:0,keyboardCaptureRevision:0,keyboardCaptureId:'',keyboardCaptureKeys:[],pendingShortcutDispatches:[],shortcutWorkerRevision:0,shortcutConnections:new Map(),shortcutAxes:new Map(),shortcutProfiles:new Map(),showInputSettings:false,errorNoticeMode:'',errors:new ErrorPresentation(),viewActive:false,foreground:true,videoMode:true,videoFullscreen:false,presentationMode:'windowed',presentationReason:'',presentationRestorePending:false,presentationOwner:0,openVideoRequest:0,pendingVideoUri:'',timer:-1,libraryBusy:false,pairOpening:false,openingVideo:false});
 p.engine={continuousInputConfiguration(){return {enabled:true,mappings:[]};},mediaSourceConfiguration(){return {selectedSource:'internal',deoVr:{host:'127.0.0.1',port:23554}};},detachMotionCanvas(){},keyboardConfiguration(){return new KeyboardShortcutConfiguration();},generalConfiguration(){return new GeneralConfiguration();},activeRegistry(){return {profile:{},revision:1};},outputConfiguration(){return {};},setForeground(v){calls.push(['engineForeground',v]);},setConnected(v){calls.push(['connected',v]);},stop(){calls.push(['stop']);},flush(){calls.push(['flush']);}};
 p.output={setForeground(v){calls.push(['output',v]);}};p.video={dispose(){calls.push(['dispose']);},release(){calls.push(['release']);return Promise.resolve();}};
 for(const name of ['deoVrSnapshot','disconnectDeoVr','sync','scanDownloads','cancelRuntimeControl','disconnectInternal','cancelMediaSeek','cancelLibrary','openPendingVideo'])p[name]=()=>calls.push([name]);
 return {p,calls};
}
async function settle(){for(let i=0;i<20;i++)await Promise.resolve();}
test('actual Ability initialization cannot resurrect foreground or attach a destroyed stage after awaiting settings',async()=>{
 const init=defer(),{app,calls}=ability({initialize:()=>init.promise});const h=new Handle();let acquired=0,loaded=0;
 const pending=app.onWindowStageCreate({getMainWindow:async()=>{acquired++;return h;},loadContent:async()=>{loaded++;}});
 app.onBackground();app.onWindowStageDestroy();init.resolve();await pending;
 assert.equal(acquired,0);assert.equal(loaded,0);assert.equal(calls.at(-1)[1],false);assert.equal(calls.some(([kind,v],i)=>i>1&&kind==='output'&&v===true),false);app.onDestroy();
});
test('actual Ability late main-window acquisition and load failure cannot touch a replacement stage',async()=>{
 const {app,calls}=ability();const getOld=defer(),old=new Handle(),replacement=new Handle();let oldLoads=0,newLoads=0;
 const first=app.onWindowStageCreate({getMainWindow:()=>getOld.promise,loadContent:async()=>oldLoads++});await settle();app.onWindowStageDestroy();
 await app.onWindowStageCreate({getMainWindow:async()=>replacement,loadContent:async()=>newLoads++});getOld.resolve(old);await first;
 assert.equal(oldLoads,0);assert.equal(newLoads,1);assert.deepEqual(old.calls,[]);
 const fail=defer();const late=app.onWindowStageCreate({getMainWindow:async()=>new Handle(),loadContent:()=>fail.promise});await settle();app.onWindowStageDestroy();
 await app.onWindowStageCreate({getMainWindow:async()=>replacement,loadContent:async()=>{}});const count=calls.length;fail.reject(Error('old stage'));await late;assert.equal(calls.length,count);app.onDestroy();
});
test('background during stage acquisition stays gated and a new foreground requires an explicit fullscreen request',async()=>{
 const {app,calls}=ability(),get=defer(),h=new Handle();const creating=app.onWindowStageCreate({getMainWindow:()=>get.promise,loadContent:async()=>{}});await settle();app.onBackground();get.resolve(h);await creating;
 await N.request(true);assert.equal(h.mode,4);assert.equal(calls.filter(([k,v])=>k==='output'&&v===true).length,1);app.onForeground();await settle();assert.equal(h.mode,4);app.onDestroy();
});
test('actual page fullscreen fallback, Back and diagnostics keep media and output independent',async()=>{
 const h=new Handle();h.maximize=async()=>{throw Error('phone mode unsupported');};await N.attachStage({getMainWindow:async()=>h});await N.setForeground(true);
 const {p,calls}=page();p.aboutToAppear();calls.length=0;p.setVideoFullscreen(true);await settle();
 assert.equal(p.videoFullscreen,true);assert.equal(p.presentationMode,'in-window');assert.ok(p.presentationReason.length>0);assert.deepEqual(calls,[]);
 assert.equal(p.onBackPress(),true);await settle();assert.equal(p.videoFullscreen,false);assert.deepEqual(calls,[]);p.aboutToDisappear();N.destroyStage();
});
test('actual page exposes failed restoration after layout exit and retries original native baseline',async()=>{
 const h=new Handle();await N.attachStage({getMainWindow:async()=>h});await N.setForeground(true);const {p}=page();p.aboutToAppear();p.setVideoFullscreen(true);await settle();assert.equal(h.mode,1);
 h.recover=async()=>{};p.setVideoFullscreen(false);await settle();assert.equal(p.videoFullscreen,false);assert.equal(p.presentationMode,'native-fullscreen');assert.equal(p.presentationRestorePending,true);
 h.recover=async()=>{h.mode=4;};assert.equal(p.exitFullscreenWithKey(2070),true);await settle();assert.equal(h.mode,4);assert.equal(p.presentationRestorePending,false);p.aboutToDisappear();N.destroyStage();
});
test('actual page background and disappearance cannot reopen native presentation after a delayed entry',async()=>{
 const h=new Handle(),wait=defer();await N.attachStage({getMainWindow:async()=>h});await N.setForeground(true);const {p}=page();p.aboutToAppear();h.wait=wait.promise;p.setVideoFullscreen(true);await settle();p.foreground=false;p.foregroundChanged();wait.resolve();await settle();assert.equal(p.videoFullscreen,false);assert.equal(h.mode,4);p.foreground=true;p.foregroundChanged();await settle();assert.equal(h.mode,4);p.aboutToDisappear();N.destroyStage();
});
test('restoration warning and retry are globally reachable, outside hidden settings and the single native Surface',()=>{
 const build=pageSource.slice(pageSource.indexOf('  build() {'));assert.match(build,/if \(this.presentationRestorePending\)/);assert.match(build,/重试退出系统全屏/);assert.match(build,/\.constraintSize\(\{ minHeight: UiStyle.control \}\)/);
 assert.equal((pageSource.match(/XComponent\(\{/g)||[]).length,1);assert.match(pageSource,/退出窗口内全屏/);assert.match(pageSource,/退出系统全屏/);
});
test('old page disappearance cannot release or clear the replacement page fullscreen owner',async()=>{
 const h=new Handle();await N.attachStage({getMainWindow:async()=>h});await N.setForeground(true);const old=page(),current=page();old.p.aboutToAppear();current.p.aboutToAppear();current.p.setVideoFullscreen(true);await settle();assert.equal(h.mode,1);
 old.p.aboutToDisappear();await settle();assert.equal(h.mode,1);assert.equal(current.p.videoFullscreen,true);const calls=h.calls.length;old.p.setVideoFullscreen(false);await settle();assert.equal(h.calls.length,calls);
 current.p.setVideoFullscreen(false);await settle();assert.equal(h.mode,4);assert.equal(current.p.presentationMode,'windowed');current.p.aboutToDisappear();N.destroyStage();
});
