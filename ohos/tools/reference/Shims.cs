// Test-only environmental shims. Numeric source bodies are not implemented here.
namespace System.Windows { public struct Point(double x, double y) { public double X {get;set;} = x; public double Y {get;set;} = y; } }
namespace Stylet { public class PropertyChangedBase {} }
namespace PropertyChanged {
 [AttributeUsage(AttributeTargets.Class)] public class AddINotifyPropertyChangedInterfaceAttribute : Attribute {}
 [AttributeUsage(AttributeTargets.Property)] public class DoNotNotifyAttribute : Attribute {}
}
namespace Newtonsoft.Json {
 public enum MemberSerialization { OptIn }
 public enum ObjectCreationHandling { Replace }
 [AttributeUsage(AttributeTargets.Class)] public class JsonObjectAttribute : Attribute { public JsonObjectAttribute(){} public JsonObjectAttribute(MemberSerialization x) {} public MemberSerialization MemberSerialization {get;set;} }
 [AttributeUsage(AttributeTargets.Property)] public class JsonPropertyAttribute : Attribute { public ObjectCreationHandling ObjectCreationHandling {get;set;} }
}
namespace MultiFunPlayer.Settings.Converters { public class DeviceAxisTypeConverter : System.ComponentModel.TypeConverter {} }
namespace MultiFunPlayer.Common {
 public class ObservableConcurrentCollection<T> : List<T> { public ObservableConcurrentCollection() {} public ObservableConcurrentCollection(IEnumerable<T> items):base(items) {} }
 public class BroadcastEvent<T> { public List<T> Events {get;} = []; public void Set(T value) => Events.Add(value); }
 public class ReferenceLogger { public void Debug(string message, params object[] args) {} public void Info(string message, params object[] args) {} public void Trace(string message, params object[] args) {} }
}
namespace MultiFunPlayer.MotionProvider.ViewModels {
 [System.ComponentModel.DisplayName("Random")] public class RandomMotionProvider {}
}
namespace MultiFunPlayer.UI.Controls.ViewModels {
 internal sealed partial class AxisState { public event System.ComponentModel.PropertyChangedEventHandler PropertyChanged; }
}

namespace System.Windows { public struct Rect(double x,double y,double width,double height) { public double Left=>x; public double Right=>x+width; public double Width=>width; } }
