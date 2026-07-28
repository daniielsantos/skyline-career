namespace SimBridgeHost.Sim;

using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using Microsoft.FlightSimulator.SimConnect;
using SimBridgeHost.Ipc;

/// <summary>
/// Real SimConnect client for MSFS 2024 using the managed SDK wrapper.
/// Console-friendly: AutoResetEvent + ReceiveMessage poll loop (no WinForms HWND).
/// </summary>
public sealed class SimConnectClient : ISimClient
{
    private const int RequestTimeoutMs = 5000;

    private readonly object _gate = new();
    private readonly AutoResetEvent _messageEvent = new(false);
    private readonly ConcurrentDictionary<uint, TaskCompletionSource<object>> _pending = new();

    private SimConnect? _sim;
    private CancellationTokenSource? _recvCts;
    private Task? _recvLoop;
    private bool _openReceived;

    private enum Definitions : uint
    {
        Snapshot = 1,
        Identity = 2,
        // Dynamic ops use allocated IDs starting at DynamicBase.
        DynamicBase = 100,
    }

    private enum Requests : uint
    {
        Snapshot = 1,
        Identity = 2,
        DynamicBase = 100,
    }

    private enum Events : uint
    {
        Dynamic = 1,
    }

    private enum Groups : uint
    {
        Default = 1,
    }

    private uint _nextDefId = (uint)Definitions.DynamicBase;
    private uint _nextReqId = (uint)Requests.DynamicBase;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct DoubleValue
    {
        public double Value;
    }

    /// <summary>
    /// Fixed snapshot layout — field order must match AddToDataDefinition order below.
    /// Paused/Slew are best-effort (0 when unavailable).
    /// </summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct SnapshotData
    {
        public double OnGround;
        public double EnginesRunning;
        public double ParkingBrake;
        public double SimRate;
        public double CgPercent;
        public double GrossWeightLb;
        public double EmptyWeightLb;
        public double MaxGrossWeightLb;
        public double FuelLeft;
        public double FuelRight;
        public double FuelSys1;
        public double FuelSys2;
        public double Station1;
        public double Station2;
        public double Station3;
        public double Station4;
        public double Station5;
        public double Station6;
        public double Station7;
        public double Station8;
        public double Station9;
        public double Station10;
        public double Station11;
        public double Station12;
        public double Station13;
        public double Station14;
        public double StationCount;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct IdentityData
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string Title;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string AtcModel;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string AtcType;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string AtcId;
    }

    public string Mode => "simconnect";
    public bool IsConnected => _sim is not null && _openReceived;

    public async Task ConnectAsync(string appName, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (_sim is not null)
            {
                return;
            }

            try
            {
                _sim = new SimConnect(appName, IntPtr.Zero, 0, _messageEvent, 0);
            }
            catch (COMException ex)
            {
                throw new SimClientException(
                    "SIM_ERROR",
                    $"Failed to open SimConnect. Is MSFS 2024 running and in a flight? Details: {ex.Message}");
            }

            _sim.OnRecvOpen += OnRecvOpen;
            _sim.OnRecvQuit += OnRecvQuit;
            _sim.OnRecvException += OnRecvException;
            _sim.OnRecvSimobjectData += OnRecvSimobjectData;

            RegisterFixedDefinitions(_sim);

            _recvCts = new CancellationTokenSource();
            _recvLoop = Task.Run(() => ReceiveLoop(_recvCts.Token));
        }

        var deadline = DateTime.UtcNow.AddMilliseconds(RequestTimeoutMs);
        while (!_openReceived)
        {
            ct.ThrowIfCancellationRequested();
            if (DateTime.UtcNow > deadline)
            {
                await DisconnectAsync(CancellationToken.None).ConfigureAwait(false);
                throw new SimClientException(
                    "SIM_ERROR",
                    "Timed out waiting for SimConnect open. Start MSFS 2024, load an aircraft, then retry.");
            }

            await Task.Delay(50, ct).ConfigureAwait(false);
        }
    }

    public async Task DisconnectAsync(CancellationToken ct = default)
    {
        _recvCts?.Cancel();
        if (_recvLoop is not null)
        {
            try { await _recvLoop.ConfigureAwait(false); }
            catch { /* ignore */ }
        }

        lock (_gate)
        {
            if (_sim is not null)
            {
                try { _sim.Dispose(); }
                catch { /* ignore */ }
                _sim = null;
            }

            _openReceived = false;
            _recvCts?.Dispose();
            _recvCts = null;
            _recvLoop = null;
        }

        FailAllPending("NOT_CONNECTED", "SimConnect disconnected");
    }

    public async Task<double> ReadSimVarAsync(string name, string unit, CancellationToken ct = default)
    {
        var sim = RequireSim();
        uint defId;
        uint reqId;
        TaskCompletionSource<object> tcs;

        lock (_gate)
        {
            defId = _nextDefId++;
            reqId = _nextReqId++;
            tcs = NewPending(reqId);

            // IMPORTANT: do NOT ClearDataDefinition — clearing an unused ID raises async
            // SIMCONNECT_EXCEPTION_UNRECOGNIZED_ID (3) and races with pending reads.
            sim.AddToDataDefinition(
                (Definitions)defId,
                name,
                NormalizeUnit(unit),
                SIMCONNECT_DATATYPE.FLOAT64,
                0.0f,
                SimConnect.SIMCONNECT_UNUSED);
            sim.RegisterDataDefineStruct<DoubleValue>((Definitions)defId);
            sim.RequestDataOnSimObject(
                (Requests)reqId,
                (Definitions)defId,
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                SIMCONNECT_PERIOD.ONCE,
                SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
                0, 0, 0);
        }

        try
        {
            var result = await WaitPending(tcs, ct).ConfigureAwait(false);
            return result is DoubleValue dv ? dv.Value : Convert.ToDouble(result);
        }
        finally
        {
            // Best-effort cleanup; ignore unrecognized-id if already gone.
            try { sim.ClearDataDefinition((Definitions)defId); }
            catch { /* ignore */ }
        }
    }

    public async Task WriteSimVarAsync(string name, string unit, double value, CancellationToken ct = default)
    {
        var sim = RequireSim();
        uint defId;

        lock (_gate)
        {
            defId = _nextDefId++;
            sim.AddToDataDefinition(
                (Definitions)defId,
                name,
                NormalizeUnit(unit),
                SIMCONNECT_DATATYPE.FLOAT64,
                0.0f,
                SimConnect.SIMCONNECT_UNUSED);
            sim.RegisterDataDefineStruct<DoubleValue>((Definitions)defId);

            // Managed wrapper expects the value object (struct) for a single datum.
            sim.SetDataOnSimObject(
                (Definitions)defId,
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                SIMCONNECT_DATA_SET_FLAG.DEFAULT,
                new DoubleValue { Value = value });
        }

        // Give SimConnect a moment to surface async exceptions for this write.
        await Task.Delay(50, ct).ConfigureAwait(false);

        try { sim.ClearDataDefinition((Definitions)defId); }
        catch { /* ignore */ }
    }

    public Task<double> ReadLVarAsync(string name, CancellationToken ct = default)
        // MSFS SU12+: LVars are readable via SimConnect with an explicit "L:" prefix.
        => ReadSimVarAsync(NormalizeLVarName(name), "number", ct);

    public Task WriteLVarAsync(string name, double value, CancellationToken ct = default)
        => WriteSimVarAsync(NormalizeLVarName(name), "number", value, ct);

    public Task TriggerHVarAsync(string name, CancellationToken ct = default)
        => throw new SimClientException(
            "UNSUPPORTED",
            "HVars require a WASM bridge module. Not available in raw SimConnect.");

    private static string NormalizeLVarName(string name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length == 0)
        {
            throw new SimClientException("INVALID_ARGUMENT", "LVar name is required");
        }

        return trimmed.StartsWith("L:", StringComparison.OrdinalIgnoreCase)
            ? "L:" + trimmed[2..]
            : "L:" + trimmed;
    }
    public Task TriggerEventAsync(string eventName, uint data = 0, CancellationToken ct = default)
    {
        var sim = RequireSim();
        lock (_gate)
        {
            sim.MapClientEventToSimEvent(Events.Dynamic, eventName);
            sim.TransmitClientEvent(
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                Events.Dynamic,
                data,
                Groups.Default,
                SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
        }

        return Task.CompletedTask;
    }

    public Task DelayAsync(int ms, CancellationToken ct = default)
        => Task.Delay(Math.Max(0, ms), ct);

    public async Task<SimSnapshotDto> SnapshotAsync(CancellationToken ct = default)
    {
        var sim = RequireSim();
        var tcs = NewPending(Requests.Snapshot);

        lock (_gate)
        {
            sim.RequestDataOnSimObject(
                Requests.Snapshot,
                Definitions.Snapshot,
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                SIMCONNECT_PERIOD.ONCE,
                SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
                0, 0, 0);
        }

        var raw = await WaitPending(tcs, ct).ConfigureAwait(false);
        if (raw is not SnapshotData data)
        {
            throw new SimClientException("SIM_ERROR", "Unexpected snapshot payload type");
        }

        // CG PERCENT with unit "Percent over 100" returns 0.244 for 24.4% MAC.
        var cgMacPercent = data.CgPercent <= 1.5 ? data.CgPercent * 100.0 : data.CgPercent;

        // Prefer modern fuelsystem mapping when present; fall back to legacy tank names.
        var left = IsSaneQuantity(data.FuelSys1) ? data.FuelSys1 : data.FuelLeft;
        var right = IsSaneQuantity(data.FuelSys2) ? data.FuelSys2 : data.FuelRight;
        if (!IsSaneQuantity(left)) left = data.FuelLeft;
        if (!IsSaneQuantity(right)) right = data.FuelRight;

        var fuelTotal = (IsSaneQuantity(left) ? left : 0) + (IsSaneQuantity(right) ? right : 0);

        var stations = new[]
        {
            data.Station1, data.Station2, data.Station3, data.Station4,
            data.Station5, data.Station6, data.Station7, data.Station8,
            data.Station9, data.Station10, data.Station11, data.Station12,
            data.Station13, data.Station14
        };
        double payloadTotal = 0;
        for (var i = 0; i < stations.Length; i++)
        {
            if (IsSaneQuantity(stations[i]))
            {
                payloadTotal += stations[i];
            }
        }

        var vars = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["SIM ON GROUND"] = data.OnGround,
            ["ENG COMBUSTION:1"] = data.EnginesRunning,
            ["BRAKE PARKING POSITION"] = data.ParkingBrake,
            ["SIMULATION RATE"] = data.SimRate,
            ["CG PERCENT"] = cgMacPercent,
            ["CG PERCENT RAW"] = data.CgPercent,
            ["TOTAL WEIGHT"] = data.GrossWeightLb,
            ["EMPTY WEIGHT"] = data.EmptyWeightLb,
            ["MAX GROSS WEIGHT"] = data.MaxGrossWeightLb,
            ["FUEL TOTAL QUANTITY"] = fuelTotal,
            ["TOTAL PAYLOAD WEIGHT"] = payloadTotal,
            ["PAYLOAD STATION COUNT"] = data.StationCount,
        };

        AddIfSane(vars, "FUEL TANK LEFT MAIN QUANTITY", data.FuelLeft);
        AddIfSane(vars, "FUEL TANK RIGHT MAIN QUANTITY", data.FuelRight);
        AddIfSane(vars, "FUELSYSTEM TANK QUANTITY:1", data.FuelSys1);
        AddIfSane(vars, "FUELSYSTEM TANK QUANTITY:2", data.FuelSys2);

        for (var i = 0; i < stations.Length; i++)
        {
            AddIfSane(vars, $"PAYLOAD STATION WEIGHT:{i + 1}", stations[i]);
        }

        return new SimSnapshotDto
        {
            OnGround = data.OnGround > 0.5,
            EnginesRunning = data.EnginesRunning > 0.5,
            ParkingBrake = data.ParkingBrake > 0.5,
            Paused = false,
            SlewActive = false,
            SimRate = data.SimRate,
            CgPercent = cgMacPercent,
            GrossWeightLb = data.GrossWeightLb,
            FuelTotal = fuelTotal,
            PayloadTotal = payloadTotal,
            Vars = vars
        };
    }

    public async Task<AircraftIdentityDto> GetAircraftIdentityAsync(CancellationToken ct = default)
    {
        var sim = RequireSim();
        var tcs = NewPending(Requests.Identity);

        lock (_gate)
        {
            sim.RequestDataOnSimObject(
                Requests.Identity,
                Definitions.Identity,
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                SIMCONNECT_PERIOD.ONCE,
                SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
                0, 0, 0);
        }

        var raw = await WaitPending(tcs, ct).ConfigureAwait(false);
        if (raw is not IdentityData data)
        {
            throw new SimClientException("SIM_ERROR", "Unexpected identity payload type");
        }

        var atcModel = NormalizeAtcToken(data.AtcModel);
        var atcType = NormalizeAtcToken(data.AtcType);
        var atcId = EmptyToNull(data.AtcId);
        var title = data.Title?.Trim() ?? "";

        return new AircraftIdentityDto
        {
            Title = title,
            AtcModel = atcModel,
            AtcType = atcType,
            AtcId = atcId,
            Icao = InferIcao(atcModel, title),
        };
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        _messageEvent.Dispose();
    }

    private static void RegisterFixedDefinitions(SimConnect sim)
    {
        // Only reliable SimVars for MSFS 2024 default aircraft.
        // Avoid FUEL TOTAL QUANTITY / TOTAL PAYLOAD WEIGHT — they throw on this airframe.
        AddFloat(sim, Definitions.Snapshot, "SIM ON GROUND", "Bool");
        AddFloat(sim, Definitions.Snapshot, "ENG COMBUSTION:1", "Bool");
        AddFloat(sim, Definitions.Snapshot, "BRAKE PARKING POSITION", "Bool");
        AddFloat(sim, Definitions.Snapshot, "SIMULATION RATE", "Number");
        AddFloat(sim, Definitions.Snapshot, "CG PERCENT", "Percent over 100");
        AddFloat(sim, Definitions.Snapshot, "TOTAL WEIGHT", "pounds");
        AddFloat(sim, Definitions.Snapshot, "EMPTY WEIGHT", "pounds");
        AddFloat(sim, Definitions.Snapshot, "MAX GROSS WEIGHT", "pounds");
        AddFloat(sim, Definitions.Snapshot, "FUEL TANK LEFT MAIN QUANTITY", "gallons");
        AddFloat(sim, Definitions.Snapshot, "FUEL TANK RIGHT MAIN QUANTITY", "gallons");
        AddFloat(sim, Definitions.Snapshot, "FUELSYSTEM TANK QUANTITY:1", "gallons");
        AddFloat(sim, Definitions.Snapshot, "FUELSYSTEM TANK QUANTITY:2", "gallons");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:1", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:2", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:3", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:4", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:5", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:6", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:7", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:8", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:9", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:10", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:11", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:12", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:13", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION WEIGHT:14", "pounds");
        AddFloat(sim, Definitions.Snapshot, "PAYLOAD STATION COUNT", "number");
        sim.RegisterDataDefineStruct<SnapshotData>(Definitions.Snapshot);

        sim.AddToDataDefinition(Definitions.Identity, "TITLE", "", SIMCONNECT_DATATYPE.STRING256, 0, SimConnect.SIMCONNECT_UNUSED);
        sim.AddToDataDefinition(Definitions.Identity, "ATC MODEL", "", SIMCONNECT_DATATYPE.STRING256, 0, SimConnect.SIMCONNECT_UNUSED);
        sim.AddToDataDefinition(Definitions.Identity, "ATC TYPE", "", SIMCONNECT_DATATYPE.STRING256, 0, SimConnect.SIMCONNECT_UNUSED);
        sim.AddToDataDefinition(Definitions.Identity, "ATC ID", "", SIMCONNECT_DATATYPE.STRING256, 0, SimConnect.SIMCONNECT_UNUSED);
        sim.RegisterDataDefineStruct<IdentityData>(Definitions.Identity);
    }

    private static void AddFloat(SimConnect sim, Definitions def, string name, string unit)
    {
        sim.AddToDataDefinition(def, name, unit, SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
    }

    private static void ResetDefinition(SimConnect sim, Definitions def)
    {
        // Kept for compatibility; prefer unique IDs over clearing.
        try
        {
            sim.ClearDataDefinition(def);
        }
        catch
        {
            // first use / already clear
        }
    }

    private SimConnect RequireSim()
    {
        if (_sim is null || !_openReceived)
        {
            throw new SimClientException("NOT_CONNECTED", "SimConnect is not connected");
        }

        return _sim;
    }

    private TaskCompletionSource<object> NewPending(uint requestId)
    {
        var tcs = new TaskCompletionSource<object>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[requestId] = tcs;
        return tcs;
    }

    private TaskCompletionSource<object> NewPending(Requests request)
        => NewPending((uint)request);

    private static async Task<object> WaitPending(TaskCompletionSource<object> tcs, CancellationToken ct)
    {
        using var timeout = new CancellationTokenSource(RequestTimeoutMs);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        await using var reg = linked.Token.Register(() =>
            tcs.TrySetException(new SimClientException("TIMEOUT", "SimConnect request timed out")));

        return await tcs.Task.ConfigureAwait(false);
    }

    private void ReceiveLoop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            if (_messageEvent.WaitOne(100))
            {
                try
                {
                    _sim?.ReceiveMessage();
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"[simconnect] ReceiveMessage error: {ex.Message}");
                }
            }
        }
    }

    private void OnRecvOpen(SimConnect sender, SIMCONNECT_RECV_OPEN data)
    {
        _openReceived = true;
        Console.WriteLine($"[simconnect] connected app={data.szApplicationName}");
    }

    private void OnRecvQuit(SimConnect sender, SIMCONNECT_RECV data)
    {
        _openReceived = false;
        Console.WriteLine("[simconnect] simulator quit");
        FailAllPending("NOT_CONNECTED", "Simulator quit");
    }

    private void OnRecvException(SimConnect sender, SIMCONNECT_RECV_EXCEPTION data)
    {
        // 3 = UNRECOGNIZED_ID — often harmless leftover from ClearDataDefinition.
        Console.Error.WriteLine(
            $"[simconnect] exception={data.dwException} sendId={data.dwSendID} index={data.dwIndex}");
        // Intentionally do not cancel pending reads here; write-path noise was stealing verifies.
    }

    private void OnRecvSimobjectData(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA data)
    {
        if (!_pending.TryRemove(data.dwRequestID, out var tcs))
        {
            return;
        }

        try
        {
            tcs.TrySetResult(data.dwData[0]);
        }
        catch (Exception ex)
        {
            tcs.TrySetException(ex);
        }
    }

    private void FailAllPending(string code, string message)
    {
        foreach (var kv in _pending)
        {
            kv.Value.TrySetException(new SimClientException(code, message));
        }

        _pending.Clear();
    }

    private static void AddIfSane(Dictionary<string, double> vars, string name, double value)
    {
        if (IsSaneQuantity(value))
        {
            vars[name] = value;
        }
    }

    private static bool IsSaneQuantity(double value)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            return false;
        }

        // Uninitialized / invalid SimVar reads often show up as ~1e-317
        if (Math.Abs(value) > 0 && Math.Abs(value) < 1e-6)
        {
            return false;
        }

        if (Math.Abs(value) > 1_000_000)
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// MSFS 2024 often returns localization keys like "ATCCOM.AC_MODEL C172.0.text".
    /// </summary>
    private static string? NormalizeAtcToken(string? raw)
    {
        var value = EmptyToNull(raw);
        if (value is null)
        {
            return null;
        }

        // ATCCOM.AC_MODEL C172.0.text -> C172
        // ATCCOM.ATC_NAME CESSNA.0.text -> CESSNA
        var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length >= 2 && parts[0].StartsWith("ATCCOM.", StringComparison.OrdinalIgnoreCase))
        {
            var token = parts[1];
            var dot = token.IndexOf('.');
            return dot > 0 ? token[..dot] : token;
        }

        return value;
    }

    private static string? InferIcao(string? atcModel, string title)
    {
        if (!string.IsNullOrWhiteSpace(atcModel) && atcModel.Length <= 6 && !atcModel.Contains(' '))
        {
            return atcModel.ToUpperInvariant();
        }

        if (title.Contains("C172", StringComparison.OrdinalIgnoreCase) ||
            title.Contains("172", StringComparison.OrdinalIgnoreCase))
        {
            return "C172";
        }

        return null;
    }

    private static string? NormalizeUnit(string unit)
        => string.IsNullOrWhiteSpace(unit) ? null : unit;

    private static string? EmptyToNull(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
