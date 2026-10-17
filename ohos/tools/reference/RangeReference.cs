using System.Text.Json;
namespace MultiFunPlayer.Input { public interface IAxisInputGestureData { double ApplyTo(double current); } }
namespace MultiFunPlayer.OutputTarget {
internal static partial class RangeReference {
 sealed class ValueGesture(double value) : MultiFunPlayer.Input.IAxisInputGestureData { public double ApplyTo(double current)=>value; }
 public static object Run(JsonElement input) {
  var s=new DeviceAxisSettings{Minimum=input.GetProperty("minimum").GetDouble(),Maximum=input.GetProperty("maximum").GetDouble()};
  var op=input.GetProperty("operation").GetString();var value=input.GetProperty("value").GetDouble();
  var lo=input.TryGetProperty("minimumLimit",out var l)?l.GetDouble():0;var hi=input.TryGetProperty("maximumLimit",out var h)?h.GetDouble():1;
  switch(op) {
   case "setMinimum":SetMinimum(s,value,lo);break;
   case "setMaximum":SetMaximum(s,value,hi);break;
   case "setMiddle":SetMiddle(s,new ValueGesture(value),lo,hi);break;
   case "offsetMiddle":OffsetMiddle(s,value,lo,hi);break;
   case "setSize":SetSize(s,new ValueGesture(value),lo,hi);break;
   case "offsetSize":OffsetSize(s,value,lo,hi);break;
   // Exact original action-expression argument: source line 306, not corrected to arithmetic midpoint.
   case "middleSetAction":OffsetMiddle(s,value-(s.Maximum-s.Minimum)/2,0,1);break;
   default:throw new ArgumentException("unknown operation");
  }
  return new{input,minimum=s.Minimum,maximum=s.Maximum};
 }
}
}
