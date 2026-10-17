#!/usr/bin/env python3
"""Produce deterministic fixtures by EXECUTING the extracted original C# pipeline."""
import copy,json,subprocess,sys
from pathlib import Path
P=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else P/'.work/results'
OUT.mkdir(parents=True,exist_ok=True)
A=[{'name':'L0','defaultValue':.5}]
def frame(t,playing=True,dt=.1,**changes):return dict(deltaSeconds=dt,positionSeconds=t,playing=playing,**changes)
def base(name,axes=A,settings=None,scripts=None,sync=None,frames=None):
 return dict(name=name,input=dict(axes=axes,settings=settings or {},scripts=scripts or {},syncSettings=sync or {'Duration':0},frames=frames or []))
plain={'InterpolationType':'Linear','AutoHomeEnabled':False}
cases=[]
cases.append(base('boundaries-linear',settings={'L0':plain},scripts={'L0':[[1,0],[2,1],[3,0]]},frames=[frame(t) for t in [0,.9,1,1.5,2,2.999,3,3.1,1.25]]))
cases.append(base('end-sync-off-preserves-inside-index',settings={'L0':plain},sync={'Duration':0,'SyncOnScriptEnd':False},scripts={'L0':[[0,0],[1,1]]},frames=[frame(t) for t in [0,.5,1,2,.25]]))
cases.append(base('initial-nan-empty-singleton',axes=[{'name':'L0','defaultValue':.5},{'name':'L1','defaultValue':.1}],scripts={'L0':[],'L1':[[1,.9]]},frames=[frame(t) for t in [0,1,2,10]]))
cases.append(base('default-home-after-script',settings={'L0':{'InterpolationType':'Linear'}},scripts={'L0':[[0,0],[1,1]]},frames=[frame(.5),frame(1)]+[frame(1,False,dt=1) for _ in range(10)]))
cases.append(base('home-zero-duration-and-delay-boundary',settings={'L0':{'InterpolationType':'Linear','AutoHomeDelay':1,'AutoHomeDuration':0,'AutoHomeTargetValue':.2}},scripts={'L0':[[0,0],[1,1]]},frames=[frame(.5),frame(.5,False,dt=.5),frame(.5,False,dt=.5),frame(.5,False,dt=.1),frame(.5,False,dt=.1)]))
cases.append(base('sync-recursive-four-seconds',settings={'L0':plain},sync={'Duration':4},scripts={'L0':[[0,0],[10,1]]},frames=[frame(i*.1,dt=.1) for i in range(45)]))
axes=[{'name':'L0','defaultValue':.5},{'name':'L1','defaultValue':.5}]
smart={'L0':plain,'L1':dict(plain,SmartLimitInputAxis='L0',SmartLimitMode='Speed',SmartLimitTargetValue=.5)}
cases.append(base('smart-cross-axis-previous-frame',axes=axes,settings=smart,scripts={'L0':[[0,0],[1,1],[2,0]],'L1':[[0,1],[2,0]]},frames=[frame(i*.1) for i in range(20)]))
cases.append(base('smart-cross-axis-reversed-order',axes=axes[::-1],settings=smart,scripts={'L0':[[0,0],[1,1],[2,0]],'L1':[[0,1],[2,0]]},frames=[frame(i*.1) for i in range(20)]))
axes=[{'name':'L0','defaultValue':.5},{'name':'R0','defaultValue':.5}]
cases.append(base('motion-follows-previous-dirty-and-speed',axes=axes,settings={'L0':plain,'R0':{'AutoHomeEnabled':False}},scripts={'L0':[[0,0],[1,1],[2,1],[3,0]]},frames=[frame(i*.1,motionValues={'R0':.9 if i%2==0 else .1}) for i in range(32)]))
cases.append(base('motion-cache-persists-when-paused',settings={'L0':dict(plain,SelectedMotionProvider='Pattern',UpdateMotionProviderWithoutScript=True)},frames=[frame(0,motionValues={'L0':.25}),frame(0,False,motionValues={'L0':.9}),frame(.1,motionValues={'L0':.75}),frame(.1,False,motionValues={'L0':.2})]))
cases.append(base('gap-fill-entry-exit-and-blend',settings={'L0':dict(plain,SelectedMotionProvider='Pattern',MotionProviderFillGaps=True,MotionProviderMinimumGapDuration=5,MotionProviderBlend=.25)},scripts={'L0':[[0,0],[1,1],[7,1],[8,0]]},frames=[frame(t,motionValues={'L0':.3}) for t in [0,.5,1,2,6,7,7.5,8]]))
cases.append(base('transition-invalid-complete-once-append',settings={'L0':plain},frames=[frame(0,False,transitions=[dict(axisName='L0',value=1,durationSeconds=1)])]+[frame(0,False) for _ in range(3)]+[frame(0,False,transitions=[dict(axisName='L0',value=-.5,durationSeconds=.5,offset=True)])]+[frame(0,False) for _ in range(14)]))
cases.append(base('bypass-retains-index-transition-priority',settings={'L0':plain},scripts={'L0':[[0,0],[1,1]]},frames=[frame(.5),frame(.5,settings={'L0':{'BypassScript':True}},transitions=[dict(axisName='L0',value=.9,durationSeconds=.2)],resetSync=['L0']),frame(.5),frame(2),frame(2,settings={'L0':{'BypassScript':False}},resetSync=['L0'])]))
cases.append(base('speed-equality-zero-infinity',settings={'L0':dict(plain,SpeedLimitEnabled=True,SpeedLimitUnitsPerSecond=1)},scripts={'L0':[[0,0],[1,1],[2,0]]},frames=[frame(0),frame(.1),frame(.4),frame(.5,settings={'L0':{'SpeedLimitUnitsPerSecond':0}}),frame(.6,settings={'L0':{'SpeedLimitUnitsPerSecond':'Infinity'}})]))
cases.append(base('scale-noncenter-invert',axes=[{'name':'A0','defaultValue':.1}],settings={'A0':dict(plain,ScriptScale=2,InvertScript=True)},scripts={'A0':[[0,.1],[1,.8]]},frames=[frame(i*.1) for i in range(11)]))

for interpolation in ['Linear','Pchip','Makima','Step']:
 cases.append(base('irregular-'+interpolation,settings={'L0':dict(plain,InterpolationType=interpolation)},scripts={'L0':[[0,.2],[.2,.9],[1.1,.1],[3,.75],[8.3,.2]]},frames=[frame(t) for t in [0,.05,.2,.21,.75,1.1,2.2,3,5,8.2,8.3]]))
for mode in ['Value','Speed']:
 cases.append(base('combined-home-sync-smart-'+mode+'-speed',axes=[{'name':'L0','defaultValue':.5},{'name':'L1','defaultValue':.5}],settings={'L0':plain,'L1':{'InterpolationType':'Linear','AutoHomeEnabled':True,'AutoHomeDelay':0,'AutoHomeDuration':1,'AutoHomeTargetValue':.25,'SmartLimitInputAxis':'L0','SmartLimitMode':mode,'SpeedLimitEnabled':True,'SpeedLimitUnitsPerSecond':.3}},sync={'Duration':4},scripts={'L0':[[0,.2],[10,.8]],'L1':[[0,.8],[10,.1]]},frames=[frame(.5)]+[frame(.5,False) for _ in range(14)]+[frame(.6,True),frame(.7,True)]))
cases.append(base('transition-before-after-not-invalid',settings={'L0':plain},scripts={'L0':[[1,.2],[2,.8]]},frames=[frame(0,False,transitions=[dict(axisName='L0',value=1,durationSeconds=1)]),frame(.5,False),frame(1.5),frame(2),frame(3,False,transitions=[dict(axisName='L0',value=.1,durationSeconds=1)]),frame(3,False)]))
cases.append(base('continuous-gap-remaining-duration-threshold',settings={'L0':dict(plain,SelectedMotionProvider='Pattern',MotionProviderFillGaps=True,MotionProviderMinimumGapDuration=5,MotionProviderBlend=.2)},scripts={'L0':[[0,.3],[2,.3],[4,.3],[6,.3],[8,.3],[9,.9]]},frames=[frame(t,motionValues={'L0':.8}) for t in [0,1,2,3,4,5,6,7,8,8.5,9]]))
cases.append(base('zero-delta-no-limits',settings={'L0':plain},scripts={'L0':[[0,.3],[2,.3]]},frames=[frame(0,dt=0),frame(0,dt=0),frame(.1),frame(.1,dt=0)]))
cases.append(base('zero-delta-initial-infinity-limit',settings={'L0':dict(plain,SpeedLimitEnabled=True,SpeedLimitUnitsPerSecond='Infinity')},scripts={'L0':[[0,.3],[2,.8]]},frames=[frame(0,dt=0),frame(.1),frame(.2)]))

from provenance import provenance
result={'provenance':provenance(),'cases':[]}
for case in cases:
 inp=OUT/'pipeline-input.tmp.json';inp.write_text(json.dumps(case['input']))
 proc=subprocess.run([sys.executable,str(P/'run.py'),'pipeline',str(inp)],capture_output=True,text=True,check=True)
 case['expected']=json.loads(proc.stdout)['frames'];result['cases'].append(case)
(OUT/'pipeline-golden.json').write_text(json.dumps(result,indent=2)+'\n')
print('EXECUTED ORIGINAL PIPELINE',len(cases),'scenarios',sum(len(c['expected']) for c in result['cases']),'frames')

valid=copy.deepcopy(result)
flags=['SyncOnMediaResourceChanged','SyncOnScriptResourceChanged','SyncOnScriptStart','SyncOnScriptEnd','SyncOnMediaPlayPause','SyncOnSeek','SyncOnAutoHomeStartEnd']
for case in valid['cases']:
 inp=case['input']
 if inp['syncSettings'].get('Duration')==0:
  inp['syncSettings']={'Duration':4,**{f:False for f in flags}};case['name']+='-valid-sync-config'
 path=OUT/'pipeline-input.tmp.json';path.write_text(json.dumps(inp))
 case['expected']=json.loads(subprocess.check_output([sys.executable,str(P/'run.py'),'pipeline',str(path)],text=True))['frames']
valid['provenance']['variant']='Valid UI sync duration; disabled sync uses seven false flags; unconditional gap sync retained.'
(OUT/'pipeline-valid-golden.json').write_text(json.dumps(valid,indent=2)+'\n')
print('VALID CONFIG',len(valid['cases']),'scenarios',sum(len(c['expected']) for c in valid['cases']),'frames')
