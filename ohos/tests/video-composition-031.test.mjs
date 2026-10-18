import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {setupIndex} from './index-controller-helpers.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/video-stage-031-sdk.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
function compose(page){
 const nodes=[],stack=[];let current,gestureOwner;const gestureStack=[];
 const context={UiStyle:{control:48,page:'#fff',accent:'#088',edge:'#ddd',danger:'#f00'},Alignment:{TopStart:0},Visibility:{Visible:'visible',Hidden:'hidden',None:'none'},HitTestMode:{None:'none',Block:'block',Default:'default'},FlexAlign:{Start:0},GesturePriority:{Low:0},GestureMode:{Exclusive:'exclusive'},PanDirection:{All:0},SliderChangeMode:{Begin:0,Moving:1,End:2,Click:3},TextOverflow:{Ellipsis:0,Clip:1,None:2},FontWeight:{Normal:400,Medium:500,Bold:700},MfpSliderMaterialModifier:class {}};
 for(const name of ['Stack','Column','Row','Button','Text','Canvas','Slider','XComponent','If']){
  context[name]=new Proxy({}, {get(_t,method){return (...args)=>{
   if(method==='create'||method==='createWithLabel'){
    const node={type:name,props:{},children:[],argument:args[0],parent:stack.at(-1)};nodes.push(node);node.parent?.children.push(node);current=node;if(!['XComponent','Slider'].includes(name))stack.push(node);return;
   }
   if(method==='pop'){assert.equal(stack.at(-1)?.type,name);stack.pop();return;}
   assert.ok(current,`${name}.${String(method)}`);current.props[method]=args.length===1?args[0]:args;
  };}});
 }
 for(const name of ['Gesture','GestureGroup','PanGesture','TapGesture']){
  context[name]=new Proxy({}, {get(_t,method){return (...args)=>{
   if(method==='create'){if(name==='Gesture'){gestureOwner=current;gestureOwner.gestures=[];}const g={type:name,options:args[0],handlers:{}};gestureOwner.gestures.push(g);gestureStack.push(g);}
   else if(method==='pop')gestureStack.pop();else gestureStack.at(-1).handlers[method]=args[0];
  };}});
 }
 context.globalThis={Gesture:context.Gesture};context.__Button__flatButton=()=>{};
 page.observeComponentCreation2=fn=>fn(1,true);page.ifElseBranchUpdateFunction=(_i,fn)=>fn();
 const build=new Function(...Object.keys(context),'return '+stripTypeScriptTypes('(function '+fixture.method.trim()+')')+';')(...Object.values(context));build.call(page);assert.equal(stack.length,0);return nodes;
}
function pageFor(w,h,screen='workspace',floating=true,full=false){const {page,calls}=setupIndex();Object.assign(page,{widthVp:w,heightVp:h,currentScreen:screen,videoMode:true,videoReady:true,videoFloating:floating,videoFullscreen:full,videoControlsVisible:true,durationMs:10000,positionMs:100});return {page,calls};}
test('recorded builder comes from exact current videoStage source',()=>{const s=source.slice(source.indexOf('  videoStage() {'),source.indexOf('  @Builder\n  workspaceSettings()'));assert.equal(crypto.createHash('sha256').update(s).digest('hex'),fixture.sourceBuilderSha256);});
for(const [w,h] of [[240,640],[390,844],[844,390],[1024,768]])test(`actual SDK builder has isolated Surface/input/chrome and bounded floating buttons ${w}x${h}`,()=>{
 const {page}=pageFor(w,h);const nodes=compose(page);const surface=nodes.find(n=>n.type==='XComponent'),input=nodes.find(n=>n.gestures),chrome=nodes.find(n=>n.type==='Column'&&n.props.zIndex===2);
 assert.equal(nodes.filter(n=>n.type==='XComponent').length,1);assert.equal(surface.props.hitTestBehavior,'none');assert.equal(surface.props.onClick,undefined);assert.equal(surface.parent,input.parent);assert.equal(input.parent,chrome.parent);assert.equal(input.props.zIndex,1);assert.equal(chrome.props.hitTestBehavior,'default');
 assert.equal(input.gestures.find(g=>g.type==='GestureGroup').options,'exclusive');assert.equal(input.gestures.find(g=>g.type==='PanGesture').options.distance,8);assert.equal(input.gestures.find(g=>g.type==='TapGesture').options.count,1);
 const buttons=nodes.filter(n=>n.type==='Button');assert.equal(buttons.length,2);assert.ok(buttons.every(n=>n.props.height===40));assert.equal(buttons[1].props.width,72);assert.equal(chrome.props.height,88);assert.equal(nodes.find(n=>n.type==='Canvas').props.height,32);
 assert.equal(input.props.height,chrome.props.position.y);assert.ok(!chrome.gestures);assert.ok(buttons.every(b=>!b.gestures));
 for(const child of nodes.filter(n=>['Button','Canvas','Slider'].includes(n.type)))for(let p=child.parent;p;p=p.parent)assert.notEqual(p.props.hitTestBehavior,'block','SDK Block excludes children: '+p.type+' blocks '+child.type);
});
test('actual compiled tap/button binding invokes the same action once; expand and drag never invoke playback',async()=>{
 const {page}=pageFor(390,844);let actions=0;page.videoPlaybackAction=async()=>{actions++;};const nodes=compose(page);const input=nodes.find(n=>n.gestures),buttons=nodes.filter(n=>n.type==='Button');input.gestures.find(g=>g.type==='TapGesture').handlers.onAction({});assert.equal(actions,1);buttons[0].props.onClick();assert.equal(actions,2);
 const pan=input.gestures.find(g=>g.type==='PanGesture');pan.handlers.onActionStart({offsetX:-8,offsetY:-8});pan.handlers.onActionUpdate({offsetX:-60,offsetY:-100});pan.handlers.onActionEnd({offsetX:-60,offsetY:-100});assert.equal(actions,2);input.gestures.find(g=>g.type==='TapGesture').handlers.onAction({});assert.equal(actions,2);
 buttons[1].props.onClick();assert.equal(page.videoFloating,false);assert.equal(actions,2);
});
test('fullscreen hidden chrome leaves full-size input plane and Surface, not a blank reserved strip',()=>{
 const {page}=pageFor(844,390,'player',false,true);page.videoControlsVisible=false;const nodes=compose(page);assert.equal(nodes.find(n=>n.type==='XComponent').props.height,390);assert.equal(nodes.find(n=>n.gestures).props.height,390);assert.equal(nodes.find(n=>n.type==='Column'&&n.props.zIndex===2).props.visibility,'hidden');
});
