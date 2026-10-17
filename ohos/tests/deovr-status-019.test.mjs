import test from 'node:test';
import assert from 'node:assert/strict';
import {setupIndex} from './index-controller-helpers.mjs';

// Execute the actual extracted page callback. A retired/nonselected source may
// update its own panel fields, but cannot overwrite a newer global Stop/error.
for (const reason of ['inactive', 'background', 'old generation', 'disconnected']) {
  test(`late unsupported DeoVR status preserves current global status: ${reason}`, () => {
    const {page}=setupIndex();
    page.viewActive=true;page.foreground=true;page.deoVrActive=true;page.deoVrGeneration=9;
    page.status='Stopped · output disarmed';page.sync=()=>{};
    page.engine.acceptDeoVrSnapshot=()=>false;page.engine.stop=()=>{};
    page.output={stop(){}};
    if(reason==='inactive')page.deoVrActive=false;
    if(reason==='background')page.foreground=false;
    page.deoVrSnapshot({status:reason==='disconnected'?'disconnected':'connected',generation:reason==='old generation'?8:9,
      closeConfirmed:true,path:null,positionSeconds:0,durationSeconds:10,playing:false,playerState:2,diagnostic:null,resourceRevision:1},[]);
    assert.equal(page.status,'Stopped · output disarmed');
  });
}
test('current connected unsupported DeoVR status stays explicitly visible and revokes output',()=>{
 const {page}=setupIndex();page.viewActive=true;page.foreground=true;page.deoVrActive=true;page.deoVrGeneration=9;
 page.status='Playing';page.sync=()=>{};page.engine.acceptDeoVrSnapshot=()=>false;let stops=0;page.output={stop(){stops++;}};
 page.deoVrSnapshot({status:'connected',generation:9,closeConfirmed:true,path:null,positionSeconds:0,durationSeconds:10,playing:false,playerState:2,diagnostic:null,resourceRevision:1},[]);
 assert.match(page.status,/非普通播放/);assert.equal(stops,1);
});
