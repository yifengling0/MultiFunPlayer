#!/usr/bin/env python3
"""Reproduce every oracle family using the pinned source. Compile first."""
import json,subprocess,sys
from pathlib import Path
from provenance import provenance
BASE=Path(__file__).resolve().parent
OUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else BASE/'.work/results'
OUT.mkdir(parents=True,exist_ok=True)
P=provenance()
def run(name,*args):
 result=json.loads(subprocess.check_output([sys.executable,str(BASE/'run.py'),*map(str,args)],text=True))
 result['provenance']=P
 result.pop('filePath',None)
 (OUT/name).write_text(json.dumps(result,indent=2)+'\n')
 print(name)
run('smoke-output.json','smoke')
run('resource-identity.json','resource-identity')
for mode,name in [('noise','noise'),('providers','provider'),('range','range')]:
 run(name+'-golden.json',mode,BASE/'inputs'/(name+'-input.json'))
for precision in range(1,11):run(f'tcode-{precision}.json','tcode',precision)
for precision in [3,4]:run(f'tcode-near-{precision}.json','tcode',precision,BASE/'inputs'/f'tcode-near-{precision}-input.json')
run('writer-rounding.json','writers',OUT/'writer-temporary')
for generator in ['generate_pipeline_cases.py','generate_clock_cases.py']:
 subprocess.run([sys.executable,str(BASE/generator),str(OUT)],check=True)
# This is an expected source defect, not an expected successful pipeline frame.
proc=subprocess.run([sys.executable,str(BASE/'run.py'),'pipeline',str(BASE/'inputs/zero-delta-speed-source-defect-input.json')],capture_output=True,text=True)
if proc.returncode==0 or 'ArithmeticException' not in proc.stderr:raise RuntimeError('Expected original Math.Sign(NaN) ArithmeticException was not observed')
(OUT/'zero-delta-speed-source-defect.json').write_text(json.dumps({'provenance':P,'inputFile':'tools/reference/inputs/zero-delta-speed-source-defect-input.json','expectedException':'ArithmeticException','observed':True,'exitCode':proc.returncode},indent=2)+'\n')
print('Expected original zero-delta ArithmeticException verified')

# A source exception is itself an observation; isolate extreme points per process.
rows=[]
for i,inp in enumerate(json.loads((BASE/'inputs/noise-extreme-input.json').read_text())):
 path=OUT/'noise-extreme-input.tmp.json';path.write_text(json.dumps([inp]))
 proc=subprocess.run([sys.executable,str(BASE/'run.py'),'noise',str(path)],capture_output=True,text=True)
 row={'input':inp,'exitCode':proc.returncode}
 if proc.returncode==0:row['expected']=json.loads(proc.stdout)['rows'][0]['value']
 elif 'IndexOutOfRangeException' in proc.stderr:row['expectedException']='IndexOutOfRangeException'
 else:raise RuntimeError('Unexpected extreme-coordinate oracle failure: '+proc.stderr)
 rows.append(row)
(OUT/'noise-extreme-golden.json').write_text(json.dumps({'provenance':P,'kind':'original-csharp-linked-OpenSimplex-extreme-coordinates','cases':rows},indent=2)+'\n')
run('int32-casts.json','int32-casts')
print('Extreme source coordinates:',len(rows),'cases;',sum('expectedException' in r for r in rows),'exceptions')
