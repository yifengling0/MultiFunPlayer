import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const tool=new URL('../tools/source_snapshot.py',import.meta.url);
test('source recovery copies production/oracles but excludes native .cxx and all generated cache/secret-config paths',()=>{
 const base=mkdtempSync(join(tmpdir(),'mfp-source-snapshot-')),root=join(base,'repository'),out=join(base,'snapshot');mkdirSync(root);
 const keep=['README.md','ohos/entry/src/main/ets/pages/Index.ets','ohos/entry/src/main/cpp/native.cpp','ohos/entry/build-profile.json5','ohos/tools/reference/golden.json','Source/Original.cs','tools/preview/index.html','.github/workflows/check.yml'];
 const omit=['.env','.env.local','ohos/local.properties','ohos/entry/.cxx/Debug/hash/build.ninja','ohos/entry/.cxx/Debug/hash/arm64/lib.so','ohos/entry/build/outputs/a.hap','ohos/.hvigor/cache','ohos/node_modules/module.js','ohos/oh_modules/native.json','ohos/tools/reference/.work/generated.cs','Source/bin/generated.dll','Source/obj/cache','ohos/.tool-home/cache','ohos/__pycache__/cache'];
 for(const path of [...keep,...omit]){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),path);}
 const outside=join(base,'outside');mkdirSync(outside);writeFileSync(join(outside,'secret.txt'),'not source');symlinkSync(outside,join(root,'ohos','linked'));symlinkSync(join(outside,'secret.txt'),join(root,'ohos','linked-file.txt'));
 const run=spawnSync('python3',[tool.pathname,root,out],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 for(const path of keep)assert.equal(readFileSync(join(out,path),'utf8'),path);
 for(const path of [...omit,'ohos/linked/secret.txt','ohos/linked-file.txt'])assert.equal(existsSync(join(out,path)),false,path);
 const again=spawnSync('python3',[tool.pathname,root,out],{encoding:'utf8'});assert.notEqual(again.status,0);assert.equal(readFileSync(join(out,'README.md'),'utf8'),'README.md');
});
