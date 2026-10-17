// Reproduce golden bytes using an existing official .NET SDK; never installs/downloads.
// MFP_DOTNET_ROOT=/path/to/dotnet-sdk node tests/file-output-oracle.generate.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=process.env.MFP_DOTNET_ROOT;
if(!root)throw Error('Set MFP_DOTNET_ROOT to an existing official .NET 9 SDK.');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'mfp-writer-oracle-'));
try {
 const source=fs.readFileSync(path.join(here,'../../Source/MultiFunPlayer/Script/IScriptWriter.cs'));
 fs.writeFileSync(path.join(work,'IScriptWriter.cs'),source);
 fs.writeFileSync(path.join(work,'GlobalUsings.cs'),'global using System; global using System.IO; global using System.Linq; global using System.Collections.Generic;');
 fs.writeFileSync(path.join(work,'Program.cs'),"using MultiFunPlayer.Script;\nusing System.Text.Json;\nvar rows = new List<object>();\nvar cases = new double[][] { new[]{0.0005,0.125},new[]{0.0015,0.125},new[]{0.0025,0.3333333333333333},new[]{0.02,0.2},new[]{1e-7,1e-7},new[]{0.00001,0.00001},new[]{100000.0,1.0},new[]{-0.0,-0.0},new[]{0.3,-0.1},new[]{0.4,1.1},new[]{1.2345678901234567,0.12345678901234567} };\nforeach(var pair in cases) {\n var id=Guid.NewGuid().ToString();var f=Path.GetTempPath()+\"/\"+id+\".funscript\";var c=f+\".csv\";\n using(var w=new FunscriptWriter(f))w.Write(pair[0],pair[1]);\n using(var w=new CsvWriter(c))w.Write(pair[0],pair[1]);\n rows.Add(new {seconds=pair[0],value=pair[1],funscript=File.ReadAllText(f),csv=File.ReadAllText(c),bom=File.ReadAllBytes(c).Take(3).ToArray()});File.Delete(f);File.Delete(c);\n}\nConsole.WriteLine(JsonSerializer.Serialize(rows));\nnamespace MultiFunPlayer.Common { internal record Keyframe(double Position, double Value); }\n");
 const sdk=fs.readdirSync(path.join(root,'sdk')).filter(v=>v.startsWith('9.')).sort().at(-1);
 const ref=fs.readdirSync(path.join(root,'packs/Microsoft.NETCore.App.Ref')).filter(v=>v.startsWith('9.')).sort().at(-1);
 const refDir=path.join(root,'packs/Microsoft.NETCore.App.Ref',ref,'ref/net9.0');
 const args=['/nologo','/nostdlib+','/langversion:13','/target:exe','/out:'+path.join(work,'oracle.dll'),...fs.readdirSync(refDir).filter(n=>n.endsWith('.dll')).map(n=>'/reference:'+path.join(refDir,n)),...['IScriptWriter.cs','GlobalUsings.cs','Program.cs'].map(n=>path.join(work,n))];
 fs.writeFileSync(path.join(work,'compile.rsp'),args.map(a=>JSON.stringify(a)).join('\n'));
 fs.writeFileSync(path.join(work,'oracle.runtimeconfig.json'),JSON.stringify({runtimeOptions:{tfm:'net9.0',framework:{name:'Microsoft.NETCore.App',version:ref}}}));
 execFileSync(path.join(root,'dotnet'),[path.join(root,'sdk',sdk,'Roslyn/bincore/csc.dll'),'/noconfig','@'+path.join(work,'compile.rsp')]);
 const rows=execFileSync(path.join(root,'dotnet'),[path.join(work,'oracle.dll')],{encoding:'utf8'}).trim();
 const provenance={executedOriginalCSharp:true,sdk,runtime:ref+' '+process.platform+'-'+process.arch,source:'Source/MultiFunPlayer/Script/IScriptWriter.cs',sha256:crypto.createHash('sha256').update(source).digest('hex'),method:'Original unmodified IScriptWriter.cs compiled with Roslyn; only Common.Keyframe type shim. Literal LF / UTF8.GetBytes, no BOM. Temporary fake output files only.'};
 // Keep raw C# JSON to preserve negative zero in fixture inputs.
 fs.writeFileSync(path.join(here,'fixtures/file-output-csharp.json'),'{"provenance":'+JSON.stringify(provenance,null,2)+',"rows":'+rows+'}\n');
} finally {fs.rmSync(work,{recursive:true,force:true});}
