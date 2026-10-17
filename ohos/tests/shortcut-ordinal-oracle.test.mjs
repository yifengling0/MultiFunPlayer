import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c)}});
const{shortcutNameEquals}=await import('../entry/src/main/ets/input/ShortcutMediaActions.ts');
import { expectedOrdinalPairs, validateOrdinalOracle, ordinalProvenance, ordinalOracleSdkRoot } from './helpers/ordinal-oracle-profile.mjs';
const pairs=JSON.parse(readFileSync(new URL('./fixtures/ordinal-case-net9.json',import.meta.url),'utf8'));
test('all 1453 pinned .NET ordinal mappings work bidirectionally and as composed names',()=>{assert.equal(pairs.length,1453);for(const[a,b]of pairs){assert.ok(shortcutNameEquals(a,b),a+'/'+b);assert.ok(shortcutNameEquals(b,a));assert.ok(shortcutNameEquals('X'+a+'y','x'+b+'Y'));}});
test('newer JS Unicode pairs are not silently admitted by the pinned reference',()=>{for(const[a,b]of[[0xa7ce,0xa7cf],[0xa7d2,0xa7d3],[0xa7d4,0xa7d5],[0x10d50,0x10d70],[0x16ea0,0x16ebb]])assert.equal(shortcutNameEquals(String.fromCodePoint(a),String.fromCodePoint(b)),false)});
const sdkRoot=ordinalOracleSdkRoot(process.env);
test('optional actual .NET ordinal oracle scans all Unicode scalars', {skip:!sdkRoot?'Set MFP_DOTNET_ROOT or DOTNET_ROOT to official .NET9 SDK':false},()=>{
 const dir=mkdtempSync(join(tmpdir(),'mfp-ordinal-oracle-'));try{
 const latest=p=>readdirSync(p).filter(x=>x.startsWith('9.')).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).at(-1);
 const sdk=latest(join(sdkRoot,'sdk')),ref=latest(join(sdkRoot,'packs/Microsoft.NETCore.App.Ref')),refs=join(sdkRoot,'packs/Microsoft.NETCore.App.Ref',ref,'ref/net9.0');
 const code=readFileSync(new URL('./helpers/OrdinalOracle.cs',import.meta.url),'utf8');
 writeFileSync(join(dir,'Program.cs'),code);
 const c=spawnSync(join(sdkRoot,'dotnet'),[join(sdkRoot,'sdk',sdk,'Roslyn/bincore/csc.dll'),'/noconfig','/nologo','/nostdlib+','/target:exe','/out:'+join(dir,'Oracle.dll'),...readdirSync(refs).filter(x=>x.endsWith('.dll')).map(f=>'/reference:'+join(refs,f)),join(dir,'Program.cs')],{encoding:'utf8',timeout:30000});assert.equal(c.status,0,c.stdout+c.stderr);
 writeFileSync(join(dir,'Oracle.runtimeconfig.json'),JSON.stringify({runtimeOptions:{tfm:'net9.0',framework:{name:'Microsoft.NETCore.App',version:ref}}}));
 for(const mode of ['host','invariant']){
  const env=mode==='invariant'?{...process.env,DOTNET_SYSTEM_GLOBALIZATION_INVARIANT:'1'}:process.env;
  const run=spawnSync(join(sdkRoot,'dotnet'),[join(dir,'Oracle.dll')],{encoding:'utf8',timeout:30000,env});assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(run.stdout);console.log('Ordinal oracle provenance: '+JSON.stringify(validateOrdinalOracle(report)));
 }

 }finally{rmSync(dir,{recursive:true,force:true});}
});

const profileProof = profile => ({ ...profile, invariant: profile.backend === 'invariant', nls: false,
 icuModule: profile.backend === 'icu' ? '/actual-loaded/libicuuc.so.' + profile.icuVersion.split('.').slice(0,2).join('.') : null });
test('supported oracle profiles derive complete expectations from both official scalar ages, without codepoint exception lists',()=>{
 const counts=ordinalProvenance.supportedOracleProfiles.map(profile=>expectedOrdinalPairs(profileProof(profile)).length);
 assert.deepEqual(counts,[1448,1453,1448]);
 assert.equal(ordinalProvenance.canonical.fixtureSha256,'72c6c1e82bec7ef276a89d25653d61e55a200435f416e08069576fcd709b2c0d');
});
test('unknown runtime/backend/data versions and contradictory mode/module proof fail closed',()=>{
 const valid=profileProof(ordinalProvenance.supportedOracleProfiles[0]);
 for(const change of [{backend:'nls'},{platform:'windows'},{runtime:'.NET 10.0.0'},{icuVersion:'78.1.0.0'},{unicodeVersion:'16.0.0.0'},{invariant:true},{nls:true},{icuModule:null},{icuModule:'/installed-but-not-selected/libicuuc.so.76.1'}])
  assert.throws(()=>expectedOrdinalPairs({...valid,...change}));
});
test('all unexpected missing, extra, modified, duplicate or reordered mappings still fail complete equality',()=>{
 const provenance=profileProof(ordinalProvenance.supportedOracleProfiles[0]);const actual=expectedOrdinalPairs(provenance);
 assert.equal(validateOrdinalOracle({provenance,pairs:actual}).pairCount,1448);
 for(const bad of [actual.slice(1),[...actual,['☃','X']],actual.map((p,i)=>i===0?[p[0],'Z']:p),[...actual,actual[0]],[actual[1],actual[0],...actual.slice(2)]])
  assert.throws(()=>validateOrdinalOracle({provenance,pairs:bad}));
});

test('CI cannot silently skip the actual Unicode oracle when SDK configuration is absent',()=>{
 assert.equal(ordinalOracleSdkRoot({}),undefined);
 assert.throws(()=>ordinalOracleSdkRoot({CI:'true'}),/refusing a skipped Unicode scan/);
 assert.throws(()=>ordinalOracleSdkRoot({CI:'1',MFP_DOTNET_ROOT:'',DOTNET_ROOT:''}));
 assert.equal(ordinalOracleSdkRoot({CI:'true',MFP_DOTNET_ROOT:'/official/sdk'}),'/official/sdk');
});
