using System.Reflection;
using System.Text.Json;
using System.Windows;
using MultiFunPlayer.Common;
using MultiFunPlayer.Script;
namespace MultiFunPlayer.UI.Controls.ViewModels;

internal sealed class ReferenceMotionManager
{
    readonly Dictionary<DeviceAxis,double> values=DeviceAxis.All.ToDictionary(a=>a,a=>double.NaN);
    public Dictionary<DeviceAxis,double> Inputs {get;}=[];
    public List<string> Updates {get;}=[];
    public void Update(DeviceAxis axis,string provider,double deltaTime) { Updates.Add(axis.Name+":"+provider); if(Inputs.TryGetValue(axis,out var value)) values[axis]=value; }
    public double GetValue(DeviceAxis axis)=>values[axis];
}

internal sealed partial class ReferenceHost
{
    readonly ReferenceLogger Logger=new();
    readonly Dictionary<DeviceAxis,AxisModel> AxisModels;
    readonly Dictionary<DeviceAxis,AxisState> AxisStates;
    readonly Dictionary<DeviceAxis,AxisSettings> AxisSettings;
    readonly Dictionary<DeviceAxis,KeyframeCollection> AxisKeyframes;
    readonly Dictionary<DeviceAxis,AxisStateUpdateContext> contexts;
    readonly ReferenceMotionManager MotionProviderManager=new();
    readonly SyncSettings SyncSettings=new();
    bool IsPlaying, _syncBypass;
    double PlaybackSpeed=1, _internalMediaPosition, MediaPosition, GlobalOffset, deltaTime;
    bool IsSyncing => AxisStates.Values.Any(s=>s.SyncTime>0);
    double SyncProgress=>0; // notification-name target only, never read by source algorithm
    readonly ReferenceLoop MediaLoopSegment=new();
    void NotifyOfPropertyChange(string property) {}
    void ClearMediaLoop()=>MediaLoopSegment.Clear();
    int sequence;
    public ReferenceHost()
    {
        AxisModels=DeviceAxis.All.ToDictionary(a=>a,a=>new AxisModel(a));
        AxisStates=AxisModels.ToDictionary(x=>x.Key,x=>x.Value.State);
        AxisSettings=AxisModels.ToDictionary(x=>x.Key,x=>x.Value.Settings);
        AxisKeyframes=DeviceAxis.All.ToDictionary(a=>a,a=>(KeyframeCollection)null);
        contexts=AxisModels.ToDictionary(x=>x.Key,x=>new AxisStateUpdateContext(x.Value));
    }
    public void Apply(JsonElement element)
    {
        if(element.TryGetProperty("globalOffsetSeconds",out var offset)) GlobalOffset=offset.GetDouble();
        if(element.TryGetProperty("settings",out var settings)) foreach(var axis in settings.EnumerateObject()) SetProperties(AxisSettings[DeviceAxis.Parse(axis.Name)],axis.Value);
        if(element.TryGetProperty("syncSettings",out var sync)) SetProperties(SyncSettings,sync);
        if(element.TryGetProperty("scripts",out var scripts)) foreach(var script in scripts.EnumerateObject())
        {
            var axis=DeviceAxis.Parse(script.Name); var model=AxisModels[axis];
            if(model.Settings.LockScript && model.Script!=null) continue;
            if(script.Value.ValueKind==JsonValueKind.Null) { model.Script=null; AxisKeyframes[axis]=null; }
            else { var keys=new KeyframeCollection(); foreach(var key in script.Value.EnumerateArray()) keys.Add(key[0].GetDouble(),key[1].GetDouble());model.Script=new ScriptResource(null,null,keys,null,null);AxisKeyframes[axis]=keys; }
            model.State.Index=AxisState.InvalidIndex;
            if(SyncSettings.SyncOnScriptResourceChanged) ResetSyncNoLock(model.State);
        }
        if(element.TryGetProperty("motionValues",out var values)) foreach(var value in values.EnumerateObject()) MotionProviderManager.Inputs[DeviceAxis.Parse(value.Name)]=Number(value.Value);
        if(element.TryGetProperty("resetSync",out var resets)) foreach(var name in resets.EnumerateArray()) ResetSyncNoLock(AxisStates[DeviceAxis.Parse(name.GetString())]);
        if(element.TryGetProperty("invalidate",out var invalid)) foreach(var name in invalid.EnumerateArray()) AxisStates[DeviceAxis.Parse(name.GetString())].Index=AxisState.InvalidIndex;
        if(element.TryGetProperty("transitions",out var transitions)) foreach(var t in transitions.EnumerateArray()) SetAxisTransition(DeviceAxis.Parse(t.GetProperty("axisName").GetString()),t.GetProperty("value").GetDouble(),t.GetProperty("durationSeconds").GetDouble(),t.TryGetProperty("offset",out var o)&&o.GetBoolean());
    }
    public object Step(JsonElement frame)
    {
        Apply(frame);
        deltaTime=frame.GetProperty("deltaSeconds").GetDouble();
        if(!double.IsFinite(deltaTime)||deltaTime<0) throw new ArgumentException("deltaSeconds must be finite and >=0");
        IsPlaying=frame.GetProperty("playing").GetBoolean();
        PlaybackSpeed=frame.TryGetProperty("playbackSpeed",out var speed)?speed.GetDouble():1;
        var position=frame.GetProperty("positionSeconds").GetDouble();
        // Adapt only media input: preserve source UpdateValues media advance body unchanged.
        MediaPosition=position-(IsPlaying?deltaTime*PlaybackSpeed:0); _internalMediaPosition=MediaPosition;
        foreach(var state in AxisStates.Values) state.BroadcastEvent.Events.Clear();
        MotionProviderManager.Updates.Clear();
        var dirty=UpdateValues(); sequence++;
        return new {sequence,mediaPositionSeconds=MediaPosition,deltaSeconds=deltaTime,dirty,motionUpdates=MotionProviderManager.Updates.ToArray(),axes=DeviceAxis.All.Select(axis=>Snapshot(axis)).ToArray()};
    }
    public void InitializeClock() { MediaPosition=double.NaN; _internalMediaPosition=double.NaN; }
    public object StepClock(JsonElement frame)
    {
        Apply(frame);
        foreach(var state in AxisStates.Values) state.BroadcastEvent.Events.Clear();
        MotionProviderManager.Updates.Clear();
        if(frame.TryGetProperty("loop",out var loop)) { MediaLoopSegment.StartPosition=loop[0].GetDouble();MediaLoopSegment.EndPosition=loop[1].GetDouble(); }
        if(frame.TryGetProperty("playing",out var playing)) Handle(new MediaPlayingChangedMessage(playing.GetBoolean()));
        if(frame.TryGetProperty("playbackSpeed",out var speed)) Handle(new MediaSpeedChangedMessage(speed.GetDouble()));
        if(frame.TryGetProperty("observedPositionSeconds",out var observation)) Handle(new MediaPositionChangedMessage(TimeSpan.FromSeconds(observation.GetDouble()),frame.TryGetProperty("forceSeek",out var force)&&force.GetBoolean()));
        deltaTime=frame.GetProperty("deltaSeconds").GetDouble();
        if(!double.IsFinite(deltaTime)||deltaTime<0) throw new ArgumentException("deltaSeconds must be finite and >=0");
        var dirty=UpdateValues();sequence++;
        return new {sequence,mediaPositionSeconds=MediaPosition,internalMediaPositionSeconds=_internalMediaPosition,isPlaying=IsPlaying,playbackSpeed=PlaybackSpeed,deltaSeconds=deltaTime,loopClearCount=MediaLoopSegment.ClearCount,dirty,axes=DeviceAxis.All.Select(axis=>Snapshot(axis)).ToArray()};
    }
    object Snapshot(DeviceAxis axis)
    {
        var s=AxisStates[axis];
        return new {axisName=axis.Name,index=s.Index,value=s.Value,scriptValue=s.ScriptValue,motionProviderValue=s.MotionProviderValue,transitionValue=s.TransitionValue,speed=s.Speed,insideGap=s.InsideGap,invalid=s.Invalid,beforeScript=s.BeforeScript,afterScript=s.AfterScript,insideScript=s.InsideScript,syncTimeSeconds=s.SyncTime,autoHomeTimeSeconds=s.AutoHomeTime,autoHomeStartValue=s.AutoHomeStartValue,isDirty=s.IsDirty,isAutoHoming=s.IsAutoHoming,isSmartLimited=s.IsSmartLimited,isSpeedLimited=s.IsSpeedLimited,events=s.BroadcastEvent.Events.Select(e=>new {kind=e.GetType().Name,targetValue=e.TargetValue,durationSeconds=e.Duration}).ToArray()};
    }
    static double Number(JsonElement value)=>value.ValueKind==JsonValueKind.String?value.GetString() switch {"NaN"=>double.NaN,"Infinity"=>double.PositiveInfinity,"-Infinity"=>double.NegativeInfinity,_=>throw new ArgumentException("unknown named number")}:value.GetDouble();
    static void SetProperties(object target,JsonElement values)
    {
        foreach(var entry in values.EnumerateObject())
        {
            var p=target.GetType().GetProperty(entry.Name,BindingFlags.Instance|BindingFlags.Public|BindingFlags.IgnoreCase)??throw new ArgumentException("Unknown source property: "+entry.Name);
            object value;
            if(p.PropertyType==typeof(DeviceAxis)) value=entry.Value.ValueKind==JsonValueKind.Null?null:DeviceAxis.Parse(entry.Value.GetString());
            else if(p.PropertyType.IsEnum) value=Enum.Parse(p.PropertyType,entry.Value.GetString(),true);
            else if(p.PropertyType==typeof(double)) value=Number(entry.Value);
            else if(p.PropertyType==typeof(bool)) value=entry.Value.GetBoolean();
            else if(p.PropertyType==typeof(string)) value=entry.Value.ValueKind==JsonValueKind.Null?null:entry.Value.GetString();
            else if(p.PropertyType==typeof(ObservableConcurrentCollection<Point>)) { var points=new ObservableConcurrentCollection<Point>();foreach(var point in entry.Value.EnumerateArray())points.Add(new Point(point[0].GetDouble(),point[1].GetDouble()));value=points; }
            else throw new ArgumentException("Unsupported host setting: "+entry.Name);
            p.SetValue(target,value);
        }
    }
}

internal sealed class ReferenceLoop {
 public double? StartPosition {get;set;}
 public double? EndPosition {get;set;}
 public int ClearCount {get;private set;}
 public void Clear(){ StartPosition=null;EndPosition=null;ClearCount++; }
}
