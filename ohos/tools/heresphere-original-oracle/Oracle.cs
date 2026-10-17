using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Threading.Channels;
using MultiFunPlayer.MediaSource.MediaResource;

// Test-only infrastructure: source-extracted ReadAsync/WriteAsync and PlayerState
// are compiled into the partial class. No TcpClient or NetworkStream is used.
sealed class MemoryClient { public bool Connected { get; set; } = true; }
sealed class SilentLogger { public void Trace(string text, params object[] args) { } public void Debug(string text, params object[] args) { } }
partial class OriginalHereSphere {
    readonly Channel<IMediaSourceControlMessage> commands = Channel.CreateUnbounded<IMediaSourceControlMessage>();
    readonly SilentLogger Logger = new();
    readonly string Name = "HereSphere";
    public readonly List<object> Events = [];
    void PublishMessage(object message) => Events.Add(message);
    async ValueTask WaitForMessageAsync(CancellationToken token) => await commands.Reader.WaitToReadAsync(token);
    ValueTask<IMediaSourceControlMessage> ReadMessageAsync(CancellationToken token) => commands.Reader.ReadAsync(token);
    public void Add(IMediaSourceControlMessage message) => commands.Writer.TryWrite(message);
}
interface IMediaSourceControlMessage;
sealed record MediaPlayPauseMessage(bool ShouldBePlaying) : IMediaSourceControlMessage;
sealed record MediaSeekMessage(TimeSpan Position) : IMediaSourceControlMessage;
sealed record MediaChangePathMessage(string Path) : IMediaSourceControlMessage;
sealed record MediaChangeSpeedMessage(double Speed) : IMediaSourceControlMessage;
sealed record UnknownControl : IMediaSourceControlMessage;
sealed record MediaPathChangedMessage(string Path, bool ReloadScripts = true, object Context = null);
sealed record MediaPlayingChangedMessage(bool IsPlaying);
sealed record MediaDurationChangedMessage(TimeSpan Duration);
sealed record MediaPositionChangedMessage(TimeSpan Position);
sealed record MediaSpeedChangedMessage(double Speed);
sealed record MediaResetMessage;

sealed class ChunkedMemoryStream(byte[] bytes, int chunk) : MemoryStream(bytes) {
    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        => base.ReadAsync(buffer[..Math.Min(chunk, buffer.Length)], token);
}
sealed class CaptureStream(MemoryClient client, int expectedWrites) : MemoryStream {
    public readonly List<byte[]> Writes = [];
    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default) {
        token.ThrowIfCancellationRequested();
        Writes.Add(buffer.ToArray());
        if (Writes.Count >= expectedWrites) client.Connected = false;
        return ValueTask.CompletedTask;
    }
}
static class Program {
    static int assertions;
    static void Check(bool ok, string reason) { assertions++; if (!ok) throw new Exception(reason); }
    static byte[] Frame(string json) { var bytes = Encoding.UTF8.GetBytes(json); return [..BitConverter.GetBytes(bytes.Length), ..bytes]; }
    static byte[] Frames(params string[] json) => json.SelectMany(Frame).ToArray();
    static string Event(object item) => item switch {
        MediaPathChangedMessage x => "path:" + x.Path,
        MediaPlayingChangedMessage x => "playing:" + x.IsPlaying.ToString().ToLowerInvariant(),
        MediaDurationChangedMessage x => "duration:" + x.Duration.TotalSeconds.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        MediaPositionChangedMessage x => "position:" + x.Position.TotalSeconds.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        MediaSpeedChangedMessage x => "speed:" + x.Speed.ToString("R", System.Globalization.CultureInfo.InvariantCulture),
        MediaResetMessage => "reset",
        _ => throw new Exception("Unknown event")
    };
    static async Task<object> ReadCase(string name, byte[] bytes, string[] expected, int chunk = int.MaxValue, string expectedTerminal = "EndOfStreamException") {
        var reader = new OriginalHereSphere(); var terminal = "none";
        using var stream = new ChunkedMemoryStream(bytes, chunk);
        try { await reader.ReadAsync(new MemoryClient(), stream, CancellationToken.None); }
        catch (Exception e) { terminal = e.GetType().Name; }
        var actual = reader.Events.Select(Event).ToArray();
        Check(actual.SequenceEqual(expected), $"{name}: events {JsonConvert.SerializeObject(actual)} != {JsonConvert.SerializeObject(expected)}");
        Check(terminal == expectedTerminal, $"{name}: terminal {terminal}");
        return new { name, inputHex = Convert.ToHexString(bytes), chunk, events = actual, terminal };
    }
    static async Task<object> WriteCase(string name, IMediaSourceControlMessage message, string field, JToken expected, double? originalRequestedSeconds = null) {
        var writer = new OriginalHereSphere(); writer.Add(message);
        var client = new MemoryClient(); using var stream = new CaptureStream(client, 1);
        await writer.WriteAsync(client, stream, CancellationToken.None);
        var bytes = stream.Writes.Single(); var length = BitConverter.ToInt32(bytes, 0);
        var json = Encoding.UTF8.GetString(bytes, 4, bytes.Length - 4);
        var obj = JObject.Parse(json);
        Check(length == bytes.Length - 4, name + " byte length");
        Check(obj.Properties().Select(x => x.Name).SequenceEqual(new[]{"path", "currentTime", "playbackSpeed", "playerState", "duration"}), name + " key order");
        Check(JToken.DeepEquals(obj[field], expected), name + " populated field");
        Check(obj.Properties().Where(p => p.Name != field).All(p => p.Value.Type == JTokenType.Null), name + " null fields");
        Check(json.Contains('\n') && json.Contains("  \"path\""), name + " indented");
        return new {name, originalRequestedSeconds, length, json, hex = Convert.ToHexString(bytes)};
    }
    static async Task Main() {
        JsonConvert.DefaultSettings = () => {
            var settings = new JsonSerializerSettings { Formatting = Formatting.Indented };
            settings.Error += (_, e) => {
                if (e.ErrorContext.Error is JsonSerializationException or JsonReaderException or JsonWriterException)
                    e.ErrorContext.Handled = true;
            };
            return settings;
        };
        const string full = "{\"path\":\"clip.mp4\",\"playerState\":0,\"duration\":60,\"currentTime\":2.5,\"playbackSpeed\":1}";
        string[] first = ["path:clip.mp4", "playing:true", "duration:60", "position:2.5", "speed:1"];
        var reads = new List<object>();
        reads.Add(await ReadCase("full-field-order", Frames(full), first));
        reads.Add(await ReadCase("one-byte-fragmentation", Frames(full), first, 1));
        reads.Add(await ReadCase("two-byte-fragmentation", Frames(full), first, 2));
        reads.Add(await ReadCase("coalesced-identical-suppressed", Frames(full, full), first));
        reads.Add(await ReadCase("changed-path-retains-other-fields", Frames(full, "{\"path\":\"next.mp4\",\"playerState\":0,\"duration\":60,\"currentTime\":2.5,\"playbackSpeed\":1}"), [..first, "path:next.mp4"]));
        reads.Add(await ReadCase("path-only-optional-retention", Frames(full, "{\"path\":\"clip.mp4\"}"), first));
        reads.Add(await ReadCase("missing-path-resets-before-fields", Frames(full, "{\"currentTime\":4}"), [..first, "reset"]));
        reads.Add(await ReadCase("blank-path-resets", Frames(full, "{\"path\":\" \",\"currentTime\":4}"), [..first, "reset"]));
        reads.Add(await ReadCase("wrong-case-path-resets", Frames(full, "{\"Path\":\"clip.mp4\"}"), [..first, "reset"]));
        reads.Add(await ReadCase("zero-before-state-no-event", [0,0,0,0], []));
        reads.Add(await ReadCase("negative-length-no-event", BitConverter.GetBytes(-1), []));
        reads.Add(await ReadCase("nonpositive-resets-once", [..Frame(full),0,0,0,0,255,255,255,255,0,0,0,0], [..first,"reset"]));
        reads.Add(await ReadCase("malformed-allocates-state-then-reset", [..Frame("{"),0,0,0,0], ["reset"]));
        reads.Add(await ReadCase("malformed-preserves-existing-state", Frames(full, "{", full), first));
        reads.Add(await ReadCase("null-optional-retention", Frames(full,"{\"path\":\"clip.mp4\",\"playerState\":null,\"duration\":null,\"currentTime\":null,\"playbackSpeed\":null}"), first));
        reads.Add(await ReadCase("invalid-negative-fields-ignored", Frames(full,"{\"path\":\"clip.mp4\",\"duration\":-1,\"currentTime\":-2,\"playbackSpeed\":0}"), first));
        reads.Add(await ReadCase("nonzero-int-state-paused", Frames("{\"path\":\"x\",\"playerState\":2}","{\"path\":\"x\",\"playerState\":-1}"), ["path:x","playing:false","playing:false"]));
        reads.Add(await ReadCase("numeric-strings-converted", Frames("{\"path\":\"x\",\"playerState\":\"0\",\"duration\":\"4.5\",\"currentTime\":\"2\",\"playbackSpeed\":\"1.5\"}"), ["path:x","playing:true","duration:4.5","position:2","speed:1.5"]));
        reads.Add(await ReadCase("fractional-state-rounding", Frames("{\"path\":\"x\",\"playerState\":0.5}","{\"path\":\"x\",\"playerState\":1.5}","{\"path\":\"x\",\"playerState\":2.5}"), ["path:x","playing:true","playing:false"]));
        reads.Add(await ReadCase("unconvertible-fields-ignored", Frames("{\"path\":\"x\",\"playerState\":\"bogus\",\"duration\":\"bogus\",\"currentTime\":{},\"playbackSpeed\":[]}"), ["path:x"]));
        reads.Add(await ReadCase("numeric-path-converted", Frames("{\"path\":42}"), ["path:42"]));
        reads.Add(await ReadCase("boolean-path-only-conversion", Frames("{\"path\":true,\"playerState\":false,\"duration\":true,\"currentTime\":false,\"playbackSpeed\":true}"), ["path:True"]));
        reads.Add(await ReadCase("duplicate-key-last-wins", Frames("{\"path\":\"first\",\"path\":\"last\",\"currentTime\":1,\"currentTime\":2}"), ["path:last","position:2"]));
        reads.Add(await ReadCase("unknown-fields-inert", Frames("{\"path\":\"x\",\"title\":\"ignored\",\"seekComplete\":true,\"commandId\":42,\"timestamp\":99}"), ["path:x"]));
        reads.Add(await ReadCase("position-over-duration-accepted", Frames("{\"path\":\"x\",\"duration\":2,\"currentTime\":10}"), ["path:x","duration:2","position:10"]));
        reads.Add(await ReadCase("inbound-time-span-truncation", Frames("{\"path\":\"x\",\"duration\":3.00000015,\"currentTime\":0.00001235}"), ["path:x","duration:3.0000001","position:1.23E-05"]));
        reads.Add(await ReadCase("raw-time-changes-equal-quantized-events", Frames("{\"path\":\"x\",\"currentTime\":1.00000001}","{\"path\":\"x\",\"currentTime\":1.00000002}","{\"path\":\"x\",\"currentTime\":1.00000002}"), ["path:x","position:1","position:1"]));
        reads.Add(await ReadCase("nan-ignored", Frames("{\"path\":\"x\",\"duration\":NaN,\"currentTime\":NaN,\"playbackSpeed\":NaN}"), ["path:x"]));
        reads.Add(await ReadCase("infinite-speed-accepted", Frames("{\"path\":\"x\",\"playbackSpeed\":Infinity}"), ["path:x","speed:Infinity"]));
        reads.Add(await ReadCase("infinite-duration-terminates", Frames("{\"path\":\"x\",\"duration\":Infinity}"), ["path:x"], expectedTerminal:"OverflowException"));
        reads.Add(await ReadCase("unicode-path", Frames("{\"path\":\"電影😀.mp4\"}"), ["path:電影😀.mp4"]));
        var invalidUtf8 = new byte[]{(byte)'{',(byte)'"',(byte)'p',(byte)'a',(byte)'t',(byte)'h',(byte)'"',(byte)':',(byte)'"',0xff,(byte)'"',(byte)'}'};
        reads.Add(await ReadCase("invalid-utf8-replacement", [..BitConverter.GetBytes(invalidUtf8.Length),..invalidUtf8], ["path:�"]));
        reads.Add(await ReadCase("truncated-payload", [..BitConverter.GetBytes(4),(byte)'{'], []));
        reads.Add(await ReadCase("truncated-header", [1,0], []));

        reads.Add(await ReadCase("resource-priority-over-path", Frames("{\"resource\":\"resource.mp4\",\"path\":\"legacy.mp4\",\"currentTime\":4}"), ["path:resource.mp4","position:4"]));
        reads.Add(await ReadCase("blank-resource-suppresses-legacy", Frames(full,"{\"resource\":\" \",\"path\":\"legacy.mp4\"}"), [..first,"reset"]));
        reads.Add(await ReadCase("null-resource-falls-back", Frames("{\"resource\":null,\"path\":\"legacy.mp4\"}"), ["path:legacy.mp4"]));
        reads.Add(await ReadCase("object-resource-falls-back", Frames("{\"resource\":{},\"path\":\"legacy.mp4\"}"), ["path:legacy.mp4"]));
        reads.Add(await ReadCase("numeric-resource-converts-and-wins", Frames("{\"resource\":42,\"path\":\"legacy.mp4\"}"), ["path:42"]));
        reads.Add(await ReadCase("bool-resource-converts-and-wins", Frames("{\"resource\":true,\"path\":\"legacy.mp4\"}"), ["path:True"]));
        reads.Add(await ReadCase("same-resource-changed-legacy-ignored", Frames("{\"resource\":\"r.mp4\",\"path\":\"a.mp4\"}","{\"resource\":\"r.mp4\",\"path\":\"b.mp4\"}"), ["path:r.mp4"]));
        reads.Add(await ReadCase("resource-to-same-legacy-no-path-event", Frames("{\"resource\":\"r.mp4\"}","{\"path\":\"r.mp4\"}"), ["path:r.mp4"]));
        reads.Add(await ReadCase("empty-resource-initial-reset", Frames("{\"resource\":\"\",\"path\":\"legacy.mp4\"}"), ["reset"]));
        reads.Add(await ReadCase("case-sensitive-resource", Frames("{\"Resource\":\"r.mp4\",\"path\":\"legacy.mp4\"}"), ["path:legacy.mp4"]));
        var contextualReader = new OriginalHereSphere();
        using var contextualStream = new ChunkedMemoryStream(Frames(
            "{\"resource\":\"x.mp4\",\"identifier\":\"https://example.test/scene/1\"}",
            "{\"resource\":\"x.mp4\",\"identifier\":\"https://example.test/scene/2\"}",
            "{\"resource\":\"y.mp4\",\"identifier\":\"relative/scene/3\"}",
            "{\"path\":\"z.mp4\",\"identifier\":\"https://example.test/scene/4\"}",
            "{\"resource\":\"w.mp4\",\"identifier\":\"ftp://example.test/scene/5\"}"), 1);
        try { await contextualReader.ReadAsync(new MemoryClient(), contextualStream, CancellationToken.None); }
        catch (EndOfStreamException) { }
        var contextEvents = contextualReader.Events.Cast<MediaPathChangedMessage>().ToArray();
        Check(contextEvents.Length == 4, "identifier-only-change-is-not-resource-change");
        Check(((HereSphereMediaResourceContext)contextEvents[0].Context).SceneUri.AbsoluteUri == "https://example.test/scene/1", "absolute-identifier-context-preserved");
        Check(contextEvents[1].Context == null, "relative-identifier-not-context");
        Check(contextEvents[2].Context == null, "legacy-path-ignores-identifier");
        Check(((HereSphereMediaResourceContext)contextEvents[3].Context).SceneUri.Scheme == "ftp", "absolute-identifier-not-http-only");

        var writes = new List<object> {
            await WriteCase("play", new MediaPlayPauseMessage(true), "playerState", new JValue(0)),
            await WriteCase("pause", new MediaPlayPauseMessage(false), "playerState", new JValue(1)),
            await WriteCase("seek-fractional", new MediaSeekMessage(TimeSpan.FromSeconds(1.25)), "currentTime", new JValue(1.25), 1.25),
            await WriteCase("seek-negative-direct-control", new MediaSeekMessage(TimeSpan.FromSeconds(-1)), "currentTime", new JValue(-1.0), -1),
            await WriteCase("path-unicode-escape", new MediaChangePathMessage("C:\\電影😀\\quote\".mp4"), "path", new JValue("C:\\電影😀\\quote\".mp4")),
            await WriteCase("speed-integer-double", new MediaChangeSpeedMessage(1), "playbackSpeed", new JValue(1.0)),
            await WriteCase("speed-fractional", new MediaChangeSpeedMessage(1.5), "playbackSpeed", new JValue(1.5)),
            await WriteCase("seek-1e-minus5", new MediaSeekMessage(TimeSpan.FromSeconds(0.00001)), "currentTime", new JValue(TimeSpan.FromSeconds(0.00001).TotalSeconds), 0.00001),
            await WriteCase("seek-1e-minus4", new MediaSeekMessage(TimeSpan.FromSeconds(0.0001)), "currentTime", new JValue(TimeSpan.FromSeconds(0.0001).TotalSeconds), 0.0001),
            await WriteCase("seek-one-tick", new MediaSeekMessage(TimeSpan.FromSeconds(1e-7)), "currentTime", new JValue(TimeSpan.FromSeconds(1e-7).TotalSeconds), 1e-7),
            await WriteCase("seek-time-span-roundtrip", new MediaSeekMessage(TimeSpan.FromSeconds(1.2345678901234567e-5)), "currentTime", new JValue(TimeSpan.FromSeconds(1.2345678901234567e-5).TotalSeconds), 1.2345678901234567e-5),
            await WriteCase("seek-tick-truncation-small", new MediaSeekMessage(TimeSpan.FromSeconds(0.00001235)), "currentTime", new JValue(TimeSpan.FromSeconds(0.00001235).TotalSeconds), 0.00001235),
            await WriteCase("seek-tick-truncation-three", new MediaSeekMessage(TimeSpan.FromSeconds(3.00000015)), "currentTime", new JValue(TimeSpan.FromSeconds(3.00000015).TotalSeconds), 3.00000015),
            await WriteCase("seek-tick-truncation-one", new MediaSeekMessage(TimeSpan.FromSeconds(1.00000005)), "currentTime", new JValue(TimeSpan.FromSeconds(1.00000005).TotalSeconds), 1.00000005),
            await WriteCase("speed-negative-zero-direct-control", new MediaChangeSpeedMessage(-0.0), "playbackSpeed", new JValue(-0.0)),
            await WriteCase("speed-small-direct-control", new MediaChangeSpeedMessage(1.2345678901234567e-5), "playbackSpeed", new JValue(1.2345678901234567e-5)),
            await WriteCase("speed-large-direct-control", new MediaChangeSpeedMessage(1.2345678901234567e20), "playbackSpeed", new JValue(1.2345678901234567e20))
        };
        var idle = new OriginalHereSphere(); var idleClient = new MemoryClient(); using var idleStream = new CaptureStream(idleClient, 1);
        var clock = Stopwatch.StartNew(); await idle.WriteAsync(idleClient, idleStream, CancellationToken.None); clock.Stop();
        Check(idleStream.Writes.Single().SequenceEqual(new byte[4]), "idle-zero-four-bytes");
        Check(clock.ElapsedMilliseconds >= 900, "idle delay");
        var resourceInputs = new[] {
            "https://example.test/folder/movie%20one.mp4?token=REDACTED#fragment",
            "https://EXAMPLE.test/folder/movie%20one.mp4?different=1",
            "http://example.test:80/movie.mp4",
            "https://example.test:443/movie.mp4",
            "https://example.test:8443/folder/movie.mp4",
            "https://example.test/folder/segment%2Fmovie.mp4?filename=ignored.mp4",
            "https://example.test/folder/segment%5Cmovie.mp4",
            "https://example.test/folder/",
            "file:///C:/Videos/movie%20one.mp4",
            "C:\\Videos\\movie one.mp4",
            "C:/Videos/movie one.mp4",
            "\\\\server.invalid\\share\\movie.mp4",
            "/synthetic/nonexistent/movie.mp4",
            "synthetic-nonexistent/movie.mp4",
            "movie.mp4?literal-query",
            "folder\\movie%20one.mp4",
            "https://user:pass@example.test/folder/movie.mp4?secret=example"
        };
        var resources = resourceInputs.Select(input => new { input, result = new MediaResourceInfoBuilder(input).Build() }).ToArray();
        Check(resources[0].result.Name == "movie one.mp4", "uri name decoded");
        Check(resources[0].result.Source == "https://example.test:443/folder", "https default 443 retained");
        Check(resources[0].result.Equals(resources[1].result), "uri query/fragment ignored by resource equality");
        Check(resources[2].result.Source == "http://example.test", "http port80 omitted");
        Check(resources[5].result.Name == "movie.mp4" && resources[5].result.Source.EndsWith("/folder/segment"), "decoded slash treated as separator");
        Check(resources[7].result == null, "trailing slash no resource");
        Check(!resources[^1].result.Source.Contains("pass") && !resources[^1].result.Source.Contains("secret"), "source strips credentials/query");
        var evidence = new { assertions, runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
            platform = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
            jsonAssembly = typeof(JsonConvert).Assembly.FullName,
            jsonInformationalVersion = typeof(JsonConvert).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion,
            sourceAdapter = "HereSphere", contextEvents, littleEndian = BitConverter.IsLittleEndian, readCases = reads, writeCases = writes, resourceCases = resources,
            idle = new { hex = Convert.ToHexString(idleStream.Writes.Single()), elapsedMs = clock.ElapsedMilliseconds } };
        Console.WriteLine(JsonConvert.SerializeObject(evidence));
    }
}
