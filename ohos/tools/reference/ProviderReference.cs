using System.Text.Json;
using System.Windows;
using MultiFunPlayer.Common;
using MultiFunPlayer.Script;
namespace ReferenceProviders;
internal abstract class MotionReferenceBase {
 public double Speed {get;set;}=1;
 public double Minimum {get;set;}=0;
 public double Maximum {get;set;}=1;
 public double Value {get;protected set;}
 public int SyncRequests {get;set;}
 protected void RequestSync()=>SyncRequests++;
 public abstract void Update(double deltaTime);
 public abstract object Snapshot();
}
internal sealed partial class CurveReference : MotionReferenceBase {
 readonly Lock _stateLock=new();
 int _index;
 KeyframeCollection _keyframes;
 bool _playing;
 bool _pendingRefreshFlag=true;
 public ObservableConcurrentCollection<Point> Points {get;set;}=[new Point(0,0)];
 public InterpolationType InterpolationType {get;set;}=InterpolationType.Linear;
 public double Duration {get;set;}=10;
 public bool IsLooping {get;set;}=true;
 public bool SyncOnEnd {get;set;}=true;
 public Rect Viewport=>new(0,0,Duration,1);
 public double Time {get;private set;}
 public CurveReference()=>ResetState(true);
 public void Refresh()=>_pendingRefreshFlag=true;
 public void Reset()=>ResetState(true);
 public override object Snapshot()=>new{value=Value,timeSeconds=Time,syncRequests=SyncRequests,index=_index,playing=_playing};
}
internal sealed partial class PatternReference : MotionReferenceBase {
 double _time;
 public PatternType Pattern {get;set;}=PatternType.Triangle;
 public override object Snapshot()=>new{value=Value,timeSeconds=_time,syncRequests=SyncRequests};
}
internal sealed partial class LoopReference : MotionReferenceBase {
 double _time,_scriptStart,_scriptEnd;
 int _scriptIndex;
 public IScriptResource Script {get;private set;}
 public InterpolationType InterpolationType {get;set;}=InterpolationType.Pchip;
 public void SetResource(KeyframeCollection keyframes){Script=keyframes==null?null:new ScriptResource(null,null,keyframes,null,null);_scriptIndex=-1;_scriptStart=keyframes is {Count:>0}?keyframes[0].Position:double.NaN;_scriptEnd=keyframes is {Count:>0}?keyframes[^1].Position:double.NaN;_time=_scriptStart;}
 public override object Snapshot()=>new{value=Value,timeSeconds=_time,syncRequests=SyncRequests,index=_scriptIndex};
}
internal static class ProviderRunner {
 static void Apply(MotionReferenceBase provider,JsonElement input) {
  if(input.TryGetProperty("speed",out var speed))provider.Speed=speed.GetDouble();
  if(input.TryGetProperty("minimum",out var minimum))provider.Minimum=minimum.GetDouble();
  if(input.TryGetProperty("maximum",out var maximum))provider.Maximum=maximum.GetDouble();
  if(provider is CurveReference curve){
   if(input.TryGetProperty("points",out var points)){curve.Points=new ObservableConcurrentCollection<Point>(points.EnumerateArray().Select(p=>new Point(p[0].GetDouble(),p[1].GetDouble())));curve.Refresh();}
   if(input.TryGetProperty("durationSeconds",out var duration)){curve.Duration=duration.GetDouble();curve.Refresh();}
   if(input.TryGetProperty("interpolationMode",out var mode))curve.InterpolationType=Enum.Parse<InterpolationType>(mode.GetString(),true);
   if(input.TryGetProperty("isLooping",out var looping)){curve.IsLooping=looping.GetBoolean();curve.OnIsLoopingChanged();}
   if(input.TryGetProperty("syncOnEnd",out var sync))curve.SyncOnEnd=sync.GetBoolean();
   if(input.TryGetProperty("reset",out var reset)&&reset.GetBoolean())curve.Reset();
  }
  if(provider is LoopReference loop){
   if(input.TryGetProperty("script",out var script)){if(script.ValueKind==JsonValueKind.Null)loop.SetResource(null);else{var keys=new KeyframeCollection();foreach(var k in script.EnumerateArray())keys.Add(k[0].GetDouble(),k[1].GetDouble());loop.SetResource(keys);}}
   if(input.TryGetProperty("interpolationMode",out var mode))loop.InterpolationType=Enum.Parse<InterpolationType>(mode.GetString(),true);
  }
  if(provider is PatternReference pattern && input.TryGetProperty("pattern",out var p))pattern.Pattern=Enum.Parse<PatternType>(p.GetString(),true);
 }
 public static object Run(JsonElement input) {
  MotionReferenceBase provider=input.GetProperty("provider").GetString() switch {"custom"=>new CurveReference(),"loop"=>new LoopReference(),"pattern"=>new PatternReference(),_=>throw new ArgumentException("provider")};
  Apply(provider,input);var frames=new List<object>();foreach(var frame in input.GetProperty("frames").EnumerateArray()){Apply(provider,frame);provider.SyncRequests=0;provider.Update(frame.GetProperty("deltaSeconds").GetDouble());frames.Add(provider.Snapshot());}
  return new{input,frames};
 }
}
