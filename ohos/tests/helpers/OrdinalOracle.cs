using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

// Test-only provenance probe. Does not configure or replace the process backend.
class OrdinalOracle
{
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    delegate void GetVersionBytes([Out] byte[] value);

    static bool ModeFlag(string name)
    {
        var mode = typeof(string).Assembly.GetType("System.Globalization.GlobalizationMode", throwOnError: true);
        var property = mode.GetProperty(name, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        if (property == null || property.PropertyType != typeof(bool))
            throw new InvalidOperationException("Cannot determine actual globalization mode: " + name);
        return (bool)property.GetValue(null);
    }

    static void Main()
    {
        var pairs = new List<string[]>();
        for (int n = 0; n <= 0x10FFFF; n++)
        {
            if (n >= 0xD800 && n <= 0xDFFF) continue;
            var s = char.ConvertFromUtf32(n);
            var u = s.ToUpperInvariant();
            if (s != u && string.Equals(s, u, StringComparison.OrdinalIgnoreCase)) pairs.Add(new[] { s, u });
        }
        var invariant = ModeFlag("Invariant");
        // The pinned runtime Unix implementation defines UseNls => false; the
        // published Linux CoreLib can trim that constant property. Windows uses
        // the actual runtime property, never an environment-variable guess.
        var nls = OperatingSystem.IsWindows() ? ModeFlag("UseNls") : false;
        string backend = invariant ? "invariant" : nls ? "nls" : "icu";
        string icuVersion = null, unicodeVersion = null, icuModule = null;
        if (backend == "icu" && OperatingSystem.IsLinux())
        {
            // Invoke CoreLib's own interop stub so its native-library resolver is
            // preserved. Loading a second shim by file path can have uninitialized
            // globals even while CoreLib is already using ICU. Never call LoadICU.
            var interop = typeof(string).Assembly.GetType("Interop+Globalization", throwOnError: true);
            var getVersion = interop.GetMethod("GetICUVersion", BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public);
            if (getVersion == null || getVersion.ReturnType != typeof(int) || getVersion.GetParameters().Length != 0)
                throw new InvalidOperationException("Cannot inspect actual CoreLib ICU interop");
            var packed = unchecked((uint)(int)getVersion.Invoke(null, null));
            var version = new byte[] { (byte)(packed >> 24), (byte)(packed >> 16), (byte)(packed >> 8), (byte)packed };
            icuVersion = string.Join(".", version);
            // Select an already-loaded module matching the runtime-selected ICU.
            // Merely finding an installed library is not backend proof.
            var modules = Process.GetCurrentProcess().Modules.Cast<ProcessModule>()
                .Where(m => Path.GetFileName(m.FileName).StartsWith("libicuuc.so." + version[0] + ".", StringComparison.Ordinal))
                .Select(m => m.FileName).Distinct().ToArray();
            if (modules.Length != 1) throw new InvalidOperationException("Cannot uniquely identify runtime-loaded ICU: selected=" + icuVersion + "; loaded=" + string.Join(",", Process.GetCurrentProcess().Modules.Cast<ProcessModule>().Select(m => m.FileName).Where(f => f.Contains("icu") || f.Contains("Globalization"))));
            icuModule = modules[0];
            var library = NativeLibrary.Load(icuModule);
            try
            {
                var verify = new byte[4];
                var readIcu = Marshal.GetDelegateForFunctionPointer<GetVersionBytes>(NativeLibrary.GetExport(library, "u_getVersion_" + version[0]));
                readIcu(verify);
                if (!verify.SequenceEqual(version)) throw new InvalidOperationException("Loaded ICU disagrees with .NET globalization shim");
                var readUnicode = Marshal.GetDelegateForFunctionPointer<GetVersionBytes>(NativeLibrary.GetExport(library, "u_getUnicodeVersion_" + version[0]));
                readUnicode(verify); unicodeVersion = string.Join(".", verify);
            }
            finally { NativeLibrary.Free(library); }
        }
        Console.Write(JsonSerializer.Serialize(new {
            provenance = new { runtime = RuntimeInformation.FrameworkDescription,
                platform = OperatingSystem.IsLinux() ? "linux" : OperatingSystem.IsWindows() ? "windows" : "other",
                architecture = RuntimeInformation.ProcessArchitecture.ToString(), os = RuntimeInformation.OSDescription,
                backend, invariant, nls, icuVersion, unicodeVersion, icuModule }, pairs
        }));
    }
}
