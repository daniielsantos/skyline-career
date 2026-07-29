namespace SimBridgeHost.Ipc;

using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using SimBridgeHost.Sim;
using SimBridgeHost.Sim.Pmdg;

public sealed class PipeServer : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = null,
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly string _pipeName;
    private readonly ISimClient _sim;
    private readonly CancellationTokenSource _cts = new();
    private Task? _acceptLoop;

    public PipeServer(string pipeName, ISimClient sim)
    {
        _pipeName = pipeName;
        _sim = sim;
    }

    public void Start()
    {
        _acceptLoop = Task.Run(() => AcceptLoopAsync(_cts.Token));
    }

    private async Task AcceptLoopAsync(CancellationToken ct)
    {
        Console.WriteLine($"[ipc] listening on \\\\.\\pipe\\{_pipeName} (mode={_sim.Mode})");

        while (!ct.IsCancellationRequested)
        {
            NamedPipeServerStream? pipe = null;
            try
            {
                pipe = new NamedPipeServerStream(
                    _pipeName,
                    PipeDirection.InOut,
                    NamedPipeServerStream.MaxAllowedServerInstances,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous);

                await pipe.WaitForConnectionAsync(ct).ConfigureAwait(false);
                Console.WriteLine("[ipc] client connected");
                _ = HandleClientAsync(pipe, ct);
            }
            catch (OperationCanceledException)
            {
                pipe?.Dispose();
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ipc] accept error: {ex.Message}");
                pipe?.Dispose();
                await Task.Delay(250, ct).ConfigureAwait(false);
            }
        }
    }

    private async Task HandleClientAsync(NamedPipeServerStream pipe, CancellationToken ct)
    {
        using var owned = pipe;
        using var reader = new StreamReader(owned, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
        using var writer = new StreamWriter(owned, new UTF8Encoding(false), bufferSize: 4096, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n"
        };

        try
        {
            while (!ct.IsCancellationRequested && owned.IsConnected)
            {
                var line = await reader.ReadLineAsync(ct).ConfigureAwait(false);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                IpcResponse response;
                try
                {
                    var request = JsonSerializer.Deserialize<IpcRequest>(line, JsonOptions);
                    if (request is null || string.IsNullOrWhiteSpace(request.Id))
                    {
                        response = IpcResponse.Fail("unknown", "INVALID_PARAMS", "Missing request id");
                    }
                    else
                    {
                        response = await DispatchAsync(request, ct).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    response = IpcResponse.Fail("unknown", "INTERNAL", ex.Message);
                }

                var payload = JsonSerializer.Serialize(response, JsonOptions);
                await writer.WriteLineAsync(payload).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
        catch (IOException)
        {
            // client disconnected
        }
        finally
        {
            Console.WriteLine("[ipc] client disconnected");
        }
    }

    private async Task<IpcResponse> DispatchAsync(IpcRequest request, CancellationToken ct)
    {
        try
        {
            switch (request.Method)
            {
                case "ping":
                    return IpcResponse.Success(request.Id, new
                    {
                        pong = true,
                        mode = _sim.Mode,
                        connected = _sim.IsConnected
                    });

                case "connect":
                {
                    var appName = GetString(request.Params, "appName") ?? "MSFS Compat Layer";
                    await _sim.ConnectAsync(appName, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new
                    {
                        connected = _sim.IsConnected,
                        mode = _sim.Mode
                    });
                }

                case "disconnect":
                    await _sim.DisconnectAsync(ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { connected = false });

                case "status":
                {
                    AircraftIdentityDto? identity = null;
                    if (_sim.IsConnected)
                    {
                        try { identity = await _sim.GetAircraftIdentityAsync(ct).ConfigureAwait(false); }
                        catch { /* optional */ }
                    }

                    return IpcResponse.Success(request.Id, new
                    {
                        mode = _sim.Mode,
                        connected = _sim.IsConnected,
                        aircraftTitle = identity?.Title
                    });
                }

                case "readSimVar":
                {
                    var name = RequireString(request.Params, "name");
                    var unit = RequireString(request.Params, "unit");
                    var value = await _sim.ReadSimVarAsync(name, unit, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { value });
                }

                case "writeSimVar":
                {
                    var name = RequireString(request.Params, "name");
                    var unit = RequireString(request.Params, "unit");
                    var value = RequireNumber(request.Params, "value");
                    await _sim.WriteSimVarAsync(name, unit, value, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { });
                }

                case "readLVar":
                {
                    var name = RequireString(request.Params, "name");
                    var value = await _sim.ReadLVarAsync(name, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { value });
                }

                case "writeLVar":
                {
                    var name = RequireString(request.Params, "name");
                    var value = RequireNumber(request.Params, "value");
                    await _sim.WriteLVarAsync(name, value, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { });
                }

                case "triggerHVar":
                {
                    var name = RequireString(request.Params, "name");
                    await _sim.TriggerHVarAsync(name, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { });
                }

                case "triggerEvent":
                {
                    var eventName = RequireString(request.Params, "event");
                    var data = (uint)(GetNumber(request.Params, "data") ?? 0);
                    await _sim.TriggerEventAsync(eventName, data, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { });
                }

                case "snapshot":
                {
                    var snap = await _sim.SnapshotAsync(ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, snap);
                }

                case "delay":
                {
                    var ms = (int)(GetNumber(request.Params, "ms") ?? 0);
                    await _sim.DelayAsync(ms, ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, new { });
                }

                case "getAircraftIdentity":
                {
                    var identity = await _sim.GetAircraftIdentityAsync(ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, identity);
                }

                case "readPmdgNg3Fuel":
                {
                    var fuel = await _sim.ReadPmdgNg3FuelAsync(ct).ConfigureAwait(false);
                    return IpcResponse.Success(request.Id, fuel);
                }

                case "sendPmdgNg3Control":
                {
                    uint eventId;
                    var eventIdNum = GetNumber(request.Params, "eventId");
                    var key = GetString(request.Params, "key");
                    if (eventIdNum is not null)
                    {
                        eventId = (uint)eventIdNum.Value;
                    }
                    else if (!string.IsNullOrWhiteSpace(key))
                    {
                        if (!PmdgNg3Cdu.TryResolveKey(key, out eventId))
                        {
                            throw new ArgumentException($"Unknown PMDG CDU key: {key}");
                        }
                    }
                    else
                    {
                        throw new ArgumentException("Missing eventId or key param");
                    }

                    var parameter = (uint)(GetNumber(request.Params, "parameter") ?? 0);
                    // Default release=true for CDU/momentary keys.
                    var release = GetBool(request.Params, "release") ?? true;
                    var method = GetString(request.Params, "method") ?? "event";

                    await _sim.SendPmdgNg3ControlAsync(eventId, parameter, release, method, ct)
                        .ConfigureAwait(false);
                    var usedParameter = parameter == 0 ? PmdgNg3Cdu.MouseLeftSingle : parameter;

                    return IpcResponse.Success(request.Id, new
                    {
                        ok = true,
                        eventId,
                        parameter = usedParameter,
                        release,
                        method
                    });
                }

                default:
                    return IpcResponse.Fail(request.Id, "UNSUPPORTED", $"Unknown method: {request.Method}");
            }
        }
        catch (SimClientException ex)
        {
            return IpcResponse.Fail(request.Id, ex.Code, ex.Message);
        }
        catch (ArgumentException ex)
        {
            return IpcResponse.Fail(request.Id, "INVALID_PARAMS", ex.Message);
        }
        catch (Exception ex)
        {
            return IpcResponse.Fail(request.Id, "INTERNAL", ex.Message);
        }
    }

    private static string? GetString(JsonElement? map, string key)
    {
        if (map is null || map.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!map.Value.TryGetProperty(key, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.ToString(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => value.ToString()
        };
    }

    private static string RequireString(JsonElement? map, string key)
        => GetString(map, key) ?? throw new ArgumentException($"Missing string param: {key}");

    private static double? GetNumber(JsonElement? map, string key)
    {
        if (map is null || map.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!map.Value.TryGetProperty(key, out var value))
        {
            return null;
        }

        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var d))
        {
            return d;
        }

        if (value.ValueKind == JsonValueKind.String && double.TryParse(value.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static double RequireNumber(JsonElement? map, string key)
        => GetNumber(map, key) ?? throw new ArgumentException($"Missing number param: {key}");

    private static bool? GetBool(JsonElement? map, string key)
    {
        if (map is null || map.Value.ValueKind != JsonValueKind.Object)
        {
            return null;
        }

        if (!map.Value.TryGetProperty(key, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.String when bool.TryParse(value.GetString(), out var b) => b,
            JsonValueKind.Number when value.TryGetDouble(out var d) => Math.Abs(d) > 0.5,
            _ => null
        };
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_acceptLoop is not null)
        {
            try { await _acceptLoop.ConfigureAwait(false); }
            catch { /* ignore */ }
        }

        _cts.Dispose();
        await _sim.DisposeAsync().ConfigureAwait(false);
    }
}
