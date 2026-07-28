using SimBridgeHost.Ipc;
using SimBridgeHost.Sim;

var pipeName = Environment.GetEnvironmentVariable("MSFS_COMPAT_PIPE") ?? "msfs-compat-simbridge";
var mode = "mock";
var sdkPath = Environment.GetEnvironmentVariable("MSFS_SDK") ?? @"C:\MSFS 2024 SDK";

for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--pipe" when i + 1 < args.Length:
            pipeName = args[++i];
            break;
        case "--mode" when i + 1 < args.Length:
            mode = args[++i].ToLowerInvariant();
            break;
        case "--sdk" when i + 1 < args.Length:
            sdkPath = args[++i];
            break;
        case "--help":
        case "-h":
            PrintHelp();
            return 0;
    }
}

if (!string.IsNullOrWhiteSpace(sdkPath))
{
    Environment.SetEnvironmentVariable("MSFS_SDK", sdkPath);
}

ISimClient sim = mode switch
{
    "mock" => new MockSimClient(),
    "simconnect" => new SimConnectClient(),
    _ => throw new ArgumentException($"Unknown mode: {mode}. Use mock|simconnect")
};

Console.WriteLine($"[host] starting SimBridgeHost mode={mode} pipe={pipeName}");
if (mode == "simconnect")
{
    Console.WriteLine($"[host] MSFS_SDK={sdkPath}");
    Console.WriteLine("[host] waiting for IPC connect() — start MSFS 2024 and load an aircraft first");
}

await using var server = new PipeServer(pipeName, sim);
server.Start();

if (mode == "mock")
{
    await sim.ConnectAsync("MSFS Compat Layer (mock)").ConfigureAwait(false);
    Console.WriteLine("[host] mock connected");
}

Console.WriteLine("[host] press Ctrl+C to exit");
var exit = new TaskCompletionSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    exit.TrySetResult();
};

await exit.Task.ConfigureAwait(false);
Console.WriteLine("[host] shutting down");
return 0;

static void PrintHelp()
{
    Console.WriteLine("""
        SimBridgeHost — local MSFS SimConnect bridge over Named Pipe NDJSON

        Usage:
          SimBridgeHost [--mode mock|simconnect] [--pipe <name>] [--sdk <path>]

        Defaults:
          --mode mock
          --pipe msfs-compat-simbridge
          --sdk  C:\MSFS 2024 SDK  (or env MSFS_SDK)

        Notes:
          simconnect mode requires MSFS 2024 running with an aircraft loaded.
          The agent must call connect() over IPC after the host starts.
        """);
}
