"""Provenance is attached after successful execution, never asserted by extraction."""
import json,subprocess,sys
from runtime import BASE,WORK

def provenance():
 manifest=json.loads((BASE/'source-manifest.json').read_text())
 build=json.loads((WORK/'build-info.json').read_text())
 actual=json.loads(subprocess.check_output([sys.executable,str(BASE/'run.py'),'info'],text=True))
 return {'executedCSharp':True,'kind':'original-csharp-source-extracted-with-host-shims', 'sdk':build['sdk'],'runtime':actual['runtime']+' '+actual['platform'],'architecture':actual['architecture'],'culture':actual['culture'], 'sourceManifest':'tools/reference/source-manifest.json','sourceHashNormalization':manifest['sourceHashNormalization'], 'sourceCommit':manifest['sourceCommit'],'sourceSha256':manifest['sources'],'shims':manifest['shims'], 'settingNotifications':'Host changes do NOT invoke WPF/Fody property notifications; fixtures explicitly request resetSync when needed; Link/resource resolution outside oracle scope.'}
