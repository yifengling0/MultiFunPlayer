using System.Text.Json;
using System.Text.Json.Serialization;
using MultiFunPlayer.Common;
using MultiFunPlayer.UI.Controls.ViewModels;
var options=new JsonSerializerOptions{WriteIndented=true,NumberHandling=JsonNumberHandling.AllowNamedFloatingPointLiterals};
if(args.Length>0&&args[0]=="info") { Console.WriteLine(JsonSerializer.Serialize(new { runtime=Environment.Version.ToString(),platform=System.Runtime.InteropServices.RuntimeInformation.RuntimeIdentifier,architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),culture=System.Globalization.CultureInfo.CurrentCulture.Name},options));return; }
if(args.Length==0||args[0]=="smoke")
{
    var keys=new KeyframeCollection();keys.Add(0,0);keys.Add(1,1);
    var pchip=keys.Interpolate(0,.25,InterpolationType.Pchip);
    if(Math.Abs(pchip-.15625)>1e-15) throw new Exception("PCHIP smoke mismatch");
    var noise=new OpenSimplex(12345);
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-source-smoke",pchip,linear=keys.Interpolate(0,.25,InterpolationType.Linear),noise=noise.Calculate2D(.25,.25,1,1,1),gap=keys.IsGap(0)},options));
    return;
}
if(args[0]=="resource-identity")
{
    var keys=new KeyframeCollection();keys.Add(0,.2);keys.Add(1,.8);
    var a=new MultiFunPlayer.Script.ScriptResource("same","same",keys,null,null);
    var b=new MultiFunPlayer.Script.ScriptResource("same","same",keys,null,null);
    MultiFunPlayer.Script.IScriptResource ia=a, ib=b, same=a;
    var linkedA=MultiFunPlayer.Script.ScriptResource.LinkTo(a);var linkedB=MultiFunPlayer.Script.ScriptResource.LinkTo(a);
    MultiFunPlayer.Script.IScriptResource ila=linkedA,ilb=linkedB;
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-linked-script-resource-static-interface-equality-probe",recordOperatorEqual=a==b,recordEquals=a.Equals(b),interfaceOperatorEqual=ia==ib,sameInterfaceReference=ia==same,freshLinkedRecordEqual=linkedA==linkedB,freshLinkedInterfaceEqual=ila==ilb,sourceSetScriptOperands="IScriptResource == IScriptResource; therefore reference equality"},options));return;
}
if(args[0]=="int32-casts")
{
    var values=new[]{0.0,double.NaN,double.PositiveInfinity,double.NegativeInfinity,2147483647.9,2147483648.0,-2147483648.9,-2147483649.0,1e20,-1e20};
    Console.WriteLine(JsonSerializer.Serialize(new{kind="dotnet-runtime-conversion-probe-not-source-extraction",rows=values.Select(value=>new{input=value.ToString("R",System.Globalization.CultureInfo.InvariantCulture),result=(int)value}).ToArray()},options));return;
}
if(args[0]=="tcode")
{
    var precision=int.Parse(args[1]);var device=DeviceSettings.DefaultDevices[1].Clone("Encoding");device.OutputPrecision=precision;DeviceAxis.InitializeFromDevice(device);var axis=DeviceAxis.Parse("L0");
    var maximum=(int)(Math.Pow(10,precision)-1);var nominal=Math.Pow(10,precision)-1;
    var values=new List<double>{0,1,.5,double.NaN,double.PositiveInfinity,double.NegativeInfinity};
    foreach(var raw in new[]{.5,1.5,2.5,42.5,nominal/2}) { var v=raw/nominal; values.Add(Math.BitDecrement(v));values.Add(v);values.Add(Math.BitIncrement(v)); }
    if(args.Length>2) {using var extra=JsonDocument.Parse(File.ReadAllText(args[2]));foreach(var v in extra.RootElement.EnumerateArray())values.Add(v.GetDouble());}
    var rows=values.Select(v=> {string encoded;try{encoded=DeviceAxis.ToString(axis,v);}catch(Exception e){encoded="EXCEPTION:"+e.GetType().Name;}return new{value=v,scaled=v*maximum,encoded};}).ToArray();
    var intervals=new[]{double.NaN,double.PositiveInfinity,double.NegativeInfinity,-1.0,0.0,0.24999999999999997,.25,.25000000000000006,1.24,1.25,1.75,2.25,2.5,40.0,2147483647.0};
    var intervalRows=intervals.Select(i=>{string encoded;try{encoded=DeviceAxis.ToString(axis,.5,i);}catch(Exception e){encoded="EXCEPTION:"+e.GetType().Name;}return new{intervalMs=i,encoded};}).ToArray();
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-linked-DeviceAxis",precision,maximum,rows,intervalRows,dirtyUnit=DeviceAxis.IsValueDirty(1/Math.Pow(10,precision),0),dirtyBelow=DeviceAxis.IsValueDirty(Math.BitDecrement(1/Math.Pow(10,precision)),0)},options));return;
}
if(args[0]=="writers")
{
    var outputDir=Path.GetFullPath(args[1]);Directory.CreateDirectory(outputDir);var path=Path.Combine(outputDir,"rounding-"+Guid.NewGuid().ToString("N")+".funscript");
    var positions=new List<double>();foreach(var ms in new[]{.5,1.5,2.5,3.5,1000.5}) {var t=ms/1000;positions.Add(Math.BitDecrement(t));positions.Add(t);positions.Add(Math.BitIncrement(t));}
    using(var writer=new MultiFunPlayer.Script.FunscriptWriter(path)) foreach(var position in positions)writer.Write(position,.123456789);
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-linked-FunscriptWriter",positionsSeconds=positions,filePath=path,content=File.ReadAllText(path)},options));return;
}
if(args[0]=="noise")
{
    using var doc=JsonDocument.Parse(File.ReadAllText(args[1]));var rows=new List<object>();foreach(var item in doc.RootElement.EnumerateArray()){var seed=long.Parse(item.GetProperty("seed").GetString());var noise=new OpenSimplex(seed);foreach(var point in item.GetProperty("points").EnumerateArray()){var x=point[0].GetDouble();var y=point[1].GetDouble();rows.Add(new{seed=seed.ToString(),x,y,octaves=item.GetProperty("octaves").GetInt32(),persistence=item.GetProperty("persistence").GetDouble(),lacunarity=item.GetProperty("lacunarity").GetDouble(),value=noise.Calculate2D(x,y,item.GetProperty("octaves").GetInt32(),item.GetProperty("persistence").GetDouble(),item.GetProperty("lacunarity").GetDouble())});}}
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-linked-OpenSimplex",rows},options));return;
}

if(args[0]=="range")
{
    using var doc=JsonDocument.Parse(File.ReadAllText(args[1]));var rows=new List<object>();foreach(var c in doc.RootElement.EnumerateArray())rows.Add(MultiFunPlayer.OutputTarget.RangeReference.Run(c));
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-source-extracted-range-helpers",rows},options));return;
}

if(args[0]=="providers")
{
    using var doc=JsonDocument.Parse(File.ReadAllText(args[1]));var rows=new List<object>();foreach(var c in doc.RootElement.EnumerateArray())rows.Add(ReferenceProviders.ProviderRunner.Run(c));
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-source-extracted-motion-providers",cases=rows},options));return;
}

if(args[0]=="math")
{
    using var doc=JsonDocument.Parse(File.ReadAllText(args[1]));var root=doc.RootElement;var samples=new List<object>();
    foreach(var row in root.GetProperty("cases").EnumerateArray())
    {
        var keys=new KeyframeCollection();foreach(var key in row.GetProperty("keyframes").EnumerateArray())keys.Add(key[0].GetDouble(),key[1].GetDouble());
        var mode=Enum.Parse<InterpolationType>(row.GetProperty("mode").GetString(),true);
        foreach(var time in row.GetProperty("times").EnumerateArray()) { var t=time.GetDouble();var index=keys.AdvanceIndex(keys.SearchForIndexBefore(t),t);var v=keys.ValidateIndex(index)&&keys.ValidateIndex(index+1)?keys.Interpolate(index,t,mode):double.NaN;samples.Add(new{mode=mode.ToString(),timeSeconds=t,index,value=v,insideGap=keys.IsGap(index),gapDurationSeconds=keys.GapDuration(index)}); }
    }
    Console.WriteLine(JsonSerializer.Serialize(new{kind="original-csharp-linked-math",samples},options));return;
}
if(args[0]!="pipeline" && args[0]!="clock") throw new ArgumentException("smoke | math | pipeline | clock | providers | noise | tcode | range | writers");
using(var doc=JsonDocument.Parse(File.ReadAllText(args[1])))
{
    var root=doc.RootElement;var device=DeviceSettings.DefaultDevices[1].Clone("Reference");
    if(root.TryGetProperty("axes",out var axes))
    {
        device.Axes.Clear();foreach(var axis in axes.EnumerateArray())device.Axes.Add(new DeviceAxisSettings{Name=axis.GetProperty("name").GetString(),FriendlyName=axis.GetProperty("name").GetString(),DefaultValue=axis.GetProperty("defaultValue").GetDouble(),Enabled=true});
    }
    DeviceAxis.InitializeFromDevice(device);var host=new ReferenceHost();host.Apply(root);if(args[0]=="clock")host.InitializeClock();var frames=new List<object>();foreach(var frame in root.GetProperty("frames").EnumerateArray())frames.Add(args[0]=="clock"?host.StepClock(frame):host.Step(frame));
    Console.WriteLine(JsonSerializer.Serialize(new{kind=args[0]=="clock"?"original-csharp-source-extracted-clock-and-pipeline":"original-csharp-source-extracted-pipeline",frames},options));
}
