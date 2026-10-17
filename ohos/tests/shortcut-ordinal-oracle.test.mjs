import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const{shortcutNameEquals}=await import('../entry/src/main/ets/input/ShortcutMediaActions.ts');
const pairs=JSON.parse(readFileSync(new URL('./fixtures/ordinal-case-net9.json',import.meta.url),'utf8'));
test('all 1453 pinned .NET ordinal mappings work bidirectionally and as composed names',()=>{assert.equal(pairs.length,1453);for(const[a,b]of pairs){assert.ok(shortcutNameEquals(a,b),a+'/'+b);assert.ok(shortcutNameEquals(b,a));assert.ok(shortcutNameEquals('X'+a+'y','x'+b+'Y'));}});
test('newer JS Unicode pairs are not silently admitted by the pinned reference',()=>{for(const[a,b]of[[0xa7ce,0xa7cf],[0xa7d2,0xa7d3],[0xa7d4,0xa7d5],[0x10d50,0x10d70],[0x16ea0,0x16ebb]])assert.equal(shortcutNameEquals(String.fromCodePoint(a),String.fromCodePoint(b)),false)});
const sdkRoot=process.env.MFP_DOTNET_ROOT||process.env.DOTNET_ROOT;
test('optional actual .NET ordinal oracle scans all Unicode scalars', {skip:!sdkRoot?'Set MFP_DOTNET_ROOT or DOTNET_ROOT to official .NET9 SDK':false},()=>{
 const dir=mkdtempSync(join(tmpdir(),'mfp-ordinal-oracle-'));try{
 const latest=p=>readdirSync(p).filter(x=>x.startsWith('9.')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
 const sdk=latest(join(sdkRoot,'sdk')),ref=latest(join(sdkRoot,'packs/Microsoft.NETCore.App.Ref')),refs=join(sdkRoot,'packs/Microsoft.NETCore.App.Ref',ref,'ref/net9.0');
 const code=`using System;using System.Collections.Generic;using System.Text.Json;class Program{static void Main(){var pairs=new List<string[]>();for(int n=0;n<=0x10FFFF;n++){if(n>=0xD800&&n<=0xDFFF)continue;var s=char.ConvertFromUtf32(n);var u=s.ToUpperInvariant();if(s!=u&&string.Equals(s,u,StringComparison.OrdinalIgnoreCase))pairs.Add(new[]{s,u});}Console.Write(JsonSerializer.Serialize(pairs));}}`;
 writeFileSync(join(dir,'Program.cs'),code);
 const c=spawnSync(join(sdkRoot,'dotnet'),[join(sdkRoot,'sdk',sdk,'Roslyn/bincore/csc.dll'),'/noconfig','/nologo','/nostdlib+','/target:exe','/out:'+join(dir,'Oracle.dll'),...readdirSync(refs).filter(x=>x.endsWith('.dll')).map(f=>'/reference:'+join(refs,f)),join(dir,'Program.cs')],{encoding:'utf8',timeout:30000});assert.equal(c.status,0,c.stdout+c.stderr);
 writeFileSync(join(dir,'Oracle.runtimeconfig.json'),JSON.stringify({runtimeOptions:{tfm:'net9.0',framework:{name:'Microsoft.NETCore.App',version:ref}}}));const run=spawnSync(join(sdkRoot,'dotnet'),[join(dir,'Oracle.dll')],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),pairs);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
