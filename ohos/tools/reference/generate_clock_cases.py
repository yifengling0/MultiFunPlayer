#!/usr/bin/env python3
"""Execute original media handlers plus unchanged UpdateValues, no input clock adaptation."""
import json,subprocess,sys
from pathlib import Path
from provenance import provenance
BASE=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else BASE/'.work/results'
OUT.mkdir(parents=True,exist_ok=True)
def tick(delta=.1,**kwargs):return {'deltaSeconds':delta,**kwargs}
def case(name,frames,sync=None):return {'name':name,'input':{'axes':[{'name':'L0','defaultValue':.5}], 'settings':{'L0':{'AutoHomeEnabled':False}}, 'scripts':{'L0':[[0,0],[100,1]]},'syncSettings':sync or {'Duration':4},'frames':frames}}
cases=[
 case('unanchored-does-not-create-position',[tick(playing=True),tick(),tick(playing=False)]),
 case('sparse-confirmed-position-and-paused-hold',[tick(0,observedPositionSeconds=10,playing=True)]+[tick() for _ in range(9)]+[tick(observedPositionSeconds=11.2)]+[tick() for _ in range(9)]+[tick(playing=False),tick(1),tick(1)]),
 case('small-backward-observation-slows-public-not-backwards',[tick(0,observedPositionSeconds=10,playing=True),tick(),tick(observedPositionSeconds=9.8)]+[tick() for _ in range(6)]),
 case('exact-one-second-error-is-not-seek',[tick(0,observedPositionSeconds=10,playing=True),tick(0,observedPositionSeconds=11),tick(),tick()]),
 case('strictly-more-than-one-second-is-seek',[tick(0,observedPositionSeconds=10,playing=True),tick(.1),tick(0,observedPositionSeconds=11.1000001),tick()]),
 case('force-seek-even-same-position',[tick(0,observedPositionSeconds=10,playing=True),tick(.2),tick(0,observedPositionSeconds=10.2,forceSeek=True),tick()]),
 case('speed-change-does-not-reset-sync',[tick(0,observedPositionSeconds=10,playing=True)]+[tick(1) for _ in range(5)]+[tick(playbackSpeed=2),tick(),tick(playbackSpeed=.5),tick()]),
 case('same-playing-value-does-not-reset',[tick(0,observedPositionSeconds=10,playing=True),tick(1),tick(1,playing=True),tick(1),tick(1,playing=False),tick(1,playing=False),tick(1,playing=True)]),
 case('disabled-seek-and-play-sync',[tick(0,observedPositionSeconds=10,playing=True)]+[tick(1) for _ in range(5)]+[tick(0,observedPositionSeconds=30),tick(1,playing=False),tick(1,playing=True)],{'Duration':4,'SyncOnSeek':False,'SyncOnMediaPlayPause':False}),
 case('seek-loop-clear-inclusive-one-second-margin',[tick(0,observedPositionSeconds=10,playing=True,loop=[10,20]),tick(0,observedPositionSeconds=19.5,forceSeek=True),tick(0,observedPositionSeconds=9,forceSeek=True),tick(0,observedPositionSeconds=21,forceSeek=True,loop=[10,20])]),
 case('paused-observations-still-adjust-internal',[tick(0,observedPositionSeconds=10,playing=False),tick(1,observedPositionSeconds=10.5),tick(1),tick(.1,playing=True)]),
]
for c in cases:
 path=OUT/'clock-input.tmp.json';path.write_text(json.dumps(c['input']))
 c['expected']=json.loads(subprocess.check_output([sys.executable,str(BASE/'run.py'),'clock',str(path)],text=True))['frames']
p=provenance();p['mode']='Exact original media position/playing/speed handlers plus UpdateValues; no sampled-position adaptation; host supplies TimeSpan.FromSeconds observations, no native player or safety gate.'
(OUT/'clock-golden.json').write_text(json.dumps({'provenance':p,'cases':cases},indent=2)+'\n')
print('CLOCK',len(cases),'cases',sum(len(c['expected']) for c in cases),'frames')
