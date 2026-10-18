import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../entry/src/main/ets/pages/Index.ets',import.meta.url),'utf8');
test('all axes remain reachable in a narrow inspector with horizontal scrolling',()=>{
 const s=page.slice(page.indexOf('  axisToolbar() {'),page.indexOf('  @Builder\n  scriptArea()'));
 assert.match(s,/Scroll\(\) \{/);assert.match(s,/scrollable\(ScrollDirection.Horizontal\)/);
 const row=s.slice(s.indexOf('Row({ space: 2 })'),s.indexOf('scrollable(ScrollDirection.Horizontal)'));
 assert.match(row,/width\(64\)/);assert.doesNotMatch(row,/\}\.width\('100%'\)\.padding\(4\)/);
});
test('video and tool-navigation 40vp buttons explicitly keep 48vp hit regions',()=>{
 for(const [start,end] of [['  videoStage() {','  @Builder\n  workspaceSettings()'],['  toolNavigation() {','  @Builder\n  wideTrace()']]){
  const s=page.slice(page.indexOf(start),page.indexOf(end));
  const heights=[...s.matchAll(/\.height\(40\)/g)];assert.ok(heights.length>0);
  for(const m of heights) assert.ok(s.slice(m.index).startsWith(".height(40).responseRegion({ y: -4, width: '100%', height: 48 })"));
 }
});
