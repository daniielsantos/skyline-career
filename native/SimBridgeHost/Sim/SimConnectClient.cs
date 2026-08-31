namespace SimBridgeHost.Sim;

using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using Microsoft.FlightSimulator.SimConnect;
using SimBridgeHost.Ipc;
using SimBridgeHost.Sim.Pmdg;

/// <summary>
/// Real SimConnect client for MSFS 2024 using the managed SDK wrapper.
/// Console-friendly: AutoResetEvent + ReceiveMessage poll loop (no WinForms HWND).
/// </summary>
public sealed class SimConnectClient : ISimClient
{
    private const int RequestTimeoutMs = 5000;
    private const int HealthyRecvMaxAgeMs = 8000;
    private const int UnrecognizedIdStormLimit = 5;
    private const int TimeoutStormLimit = 3;

    private readonly object _gate = new();
    private readonly AutoResetEvent _messageEvent = new(false);
    private readonly ConcurrentDictionary<uint, TaskCompletionSource<object>> _pending = new();
    private readonly ConcurrentDictionary<string, AirportFacilityDto> _airportCache = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim _facilityGate = new(1, 1);
    /// <summary>Serialize dynamic SimConnect calls across concurrent IPC clients.</summary>
    private readonly SemaphoreSlim _simOpGate = new(1, 1);
    private readonly object _airportListGate = new();
    private TaskCompletionSource<bool>? _airportListTcs;
    private bool _airportFacilityDefReady;
    private bool _airportListComplete;
    private string? _facilityRequestIcao;
    private AirportFacilityDto? _facilityPartial;
    private readonly List<AirportRunwayDto> _facilityRunways = new();

    private SimConnect? _sim;
    private CancellationTokenSource? _recvCts;
    private Task? _recvLoop;
    private bool _openReceived;
    private long _lastHealthyRecvUtcTicks;
    private int _consecutiveUnrecognizedId;
    private int _consecutiveTimeouts;
    private int _pendingSessionTearDown;
    private bool _pmdgNg3Subscribed;
    private bool _pmdgControlSubscribed;
    private readonly object _pmdgFuelGate = new();
    private readonly object _pmdgControlGate = new();
    private byte[]? _pmdgRaw;
    private DateTime? _pmdgFuelUtc;
    private int _pmdgFuelOffset = -1;
    private uint _pmdgControlEventId;

    private enum Definitions : uint
    {
        Snapshot = 1,
        Identity = 2,
        AirportFacility = 50,
        // Dynamic ops use allocated IDs starting at DynamicBase.
        DynamicBase = 100,
    }

    private enum Requests : uint
    {
        Snapshot = 1,
        Identity = 2,
        AirportFacility = 50,
        AirportList = 51,
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

    private enum ClientDataIds : uint
    {
        PmdgNg3 = PmdgNg3ClientData.ClientDataId,
        PmdgNg3Control = PmdgNg3ClientData.ControlClientDataId,
    }

    private enum ClientDataDefinitions : uint
    {
        PmdgNg3Data = PmdgNg3ClientData.DataDefinitionId,
        PmdgNg3Control = PmdgNg3ClientData.ControlDefinitionId,
    }

    private enum ClientDataRequests : uint
    {
        PmdgNg3Data = 51000,
        PmdgNg3DataOnce = 51001,
        PmdgNg3Control = 51002,
    }

    private uint _nextDefId = (uint)Definitions.DynamicBase;
    private uint _nextReqId = (uint)Requests.DynamicBase;
    /// <summary>
    /// Reuse AddToDataDefinition layouts for identical Watch/inject batches.
    /// Cleared on ConnectAsync / tear-down — never ClearDataDefinition.
    /// </summary>
    private const int MaxCachedBatchDefs = 48;
    private const int MaxCachedSingleDefs = 64;
    private readonly Dictionary<string, uint> _batchDefCache = new(StringComparer.Ordinal);
    private readonly Dictionary<string, uint> _singleDefCache = new(StringComparer.Ordinal);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct DoubleValue
    {
        public double Value;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Batch8
    {
        public double V0, V1, V2, V3, V4, V5, V6, V7;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Batch16
    {
        public double V0, V1, V2, V3, V4, V5, V6, V7;
        public double V8, V9, V10, V11, V12, V13, V14, V15;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Batch24
    {
        public double V0, V1, V2, V3, V4, V5, V6, V7;
        public double V8, V9, V10, V11, V12, V13, V14, V15;
        public double V16, V17, V18, V19, V20, V21, V22, V23;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct Batch32
    {
        public double V0, V1, V2, V3, V4, V5, V6, V7;
        public double V8, V9, V10, V11, V12, V13, V14, V15;
        public double V16, V17, V18, V19, V20, V21, V22, V23;
        public double V24, V25, V26, V27, V28, V29, V30, V31;
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
        public double FuelCenter;
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

    /// <summary>Facility definition field order must match AddToFacilityDefinition below.</summary>
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct AirportFacilityData
    {
        public double Latitude;
        public double Longitude;
        public double Altitude;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string Name;
    }

    /// <summary>Nested RUNWAY child — field order must match AddToFacilityDefinition.</summary>
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct RunwayFacilityData
    {
        public double Latitude;
        public double Longitude;
        public float Heading;
        public float Length;
        public float Width;
        public int Surface;
        public int PrimaryNumber;
        public int PrimaryDesignator;
        public int SecondaryNumber;
        public int SecondaryDesignator;
    }

    public string Mode => "simconnect";
    public bool IsConnected => _sim is not null && _openReceived;

    public SimSessionHealthDto GetSessionHealth()
    {
        var open = _sim is not null && _openReceived;
        var ticks = Interlocked.Read(ref _lastHealthyRecvUtcTicks);
        int? ageMs = ticks == 0
            ? null
            : (int)Math.Max(0, (DateTime.UtcNow - new DateTime(ticks, DateTimeKind.Utc)).TotalMilliseconds);
        var timeouts = Volatile.Read(ref _consecutiveTimeouts);
        var unrecognized = Volatile.Read(ref _consecutiveUnrecognizedId);
        var pendingTear = Volatile.Read(ref _pendingSessionTearDown) != 0;
        // Idle (no timeouts) is healthy even if nobody has read for >8s.
        // The 8s window only applies once TIMEOUTs are accumulating (hang mole).
        var recvFreshEnough = timeouts == 0
            || (ageMs is int age && age < HealthyRecvMaxAgeMs);
        var healthy = open
            && !pendingTear
            && recvFreshEnough
            && timeouts < TimeoutStormLimit
            && unrecognized < UnrecognizedIdStormLimit;
        return new SimSessionHealthDto
        {
            Connected = healthy,
            SessionHealthy = healthy,
            LastRecvAgeMs = ageMs,
            ConsecutiveTimeouts = timeouts,
        };
    }

    /// <summary>
    /// Reuse the handle only when recv is healthy and no TIMEOUT has fired.
    /// One hang-mole timeout must not early-return — next IPC connect() reopens.
    /// </summary>
    private bool CanReuseOpenSession()
        => _sim is not null
           && _openReceived
           && Volatile.Read(ref _consecutiveTimeouts) == 0
           && GetSessionHealth().SessionHealthy;

    public async Task ConnectAsync(string appName, CancellationToken ct = default)
    {
        Task? priorRecvLoop = null;
        CancellationTokenSource? priorRecvCts = null;

        lock (_gate)
        {
            if (CanReuseOpenSession())
            {
                return;
            }

            // Join a dead/stale receive loop before opening a new session.
            priorRecvLoop = _recvLoop;
            priorRecvCts = _recvCts;
            _recvLoop = null;
            _recvCts = null;

            if (_sim is not null)
            {
                try { _sim.Dispose(); } catch { /* ignore */ }
                _sim = null;
                _openReceived = false;
                ClearDynamicDefCache();
            }
        }

        try { priorRecvCts?.Cancel(); } catch { /* ignore */ }
        if (priorRecvLoop is not null)
        {
            try { await priorRecvLoop.ConfigureAwait(false); }
            catch { /* ignore */ }
        }
        try { priorRecvCts?.Dispose(); } catch { /* ignore */ }

        lock (_gate)
        {
            if (CanReuseOpenSession())
            {
                return;
            }

            try
            {
                _sim = new SimConnect(appName, IntPtr.Zero, 0, _messageEvent, 0);
            }
            catch (COMException)
            {
                // Do not append COM HRESULT prose — UI footer shows this string as-is.
                throw new SimClientException(
                    "SIM_ERROR",
                    "MSFS not connected — start MSFS 2024 and load a flight.");
            }

            _sim.OnRecvOpen += OnRecvOpen;
            _sim.OnRecvQuit += OnRecvQuit;
            _sim.OnRecvException += OnRecvException;
            _sim.OnRecvSimobjectData += OnRecvSimobjectData;
            _sim.OnRecvClientData += OnRecvClientData;
            _sim.OnRecvFacilityData += OnRecvFacilityData;
            _sim.OnRecvFacilityDataEnd += OnRecvFacilityDataEnd;
            _sim.OnRecvAirportList += OnRecvAirportList;

            _nextDefId = (uint)Definitions.DynamicBase;
            _nextReqId = (uint)Requests.DynamicBase;
            ClearDynamicDefCache();
            ResetSessionHealth();
            RegisterFixedDefinitions(_sim);
            _airportCache.Clear();
            _airportListComplete = false;
            _facilityPartial = null;
            _facilityRequestIcao = null;
            _facilityRunways.Clear();
            _pmdgNg3Subscribed = false;
            _pmdgControlSubscribed = false;

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
                    "MSFS not ready — start MSFS 2024, load an aircraft, then retry.");
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
            ClearDynamicDefCache();
            ResetSessionHealth();
            _pmdgNg3Subscribed = false;
            _pmdgControlSubscribed = false;
            lock (_pmdgFuelGate)
            {
                _pmdgRaw = null;
                _pmdgFuelUtc = null;
                _pmdgFuelOffset = -1;
            }
            lock (_pmdgControlGate)
            {
                _pmdgControlEventId = 0;
            }
            _airportFacilityDefReady = false;
            _airportListComplete = false;
            _facilityPartial = null;
            _facilityRequestIcao = null;
            _airportCache.Clear();
            lock (_airportListGate)
            {
                _airportListTcs?.TrySetCanceled();
                _airportListTcs = null;
            }
            _recvCts?.Dispose();
            _recvCts = null;
            _recvLoop = null;
        }

        FailAllPending("NOT_CONNECTED", "SimConnect disconnected");
    }

    public async Task<double> ReadSimVarAsync(string name, string unit, CancellationToken ct = default)
    {
        await _simOpGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var sim = RequireSim();
            uint defId;
            uint reqId;
            TaskCompletionSource<object> tcs;

            lock (_gate)
            {
                // Do NOT ClearDataDefinition after use — it raises async
                // SIMCONNECT_EXCEPTION_UNRECOGNIZED_ID (3) and races with pending reads.
                // Identical (name, unit) reuse the same def until ConnectAsync reset.
                defId = EnsureSingleDef(sim, name, unit);
                reqId = _nextReqId++;
                tcs = NewPending(reqId);
                sim.RequestDataOnSimObject(
                    (Requests)reqId,
                    (Definitions)defId,
                    SimConnect.SIMCONNECT_OBJECT_ID_USER,
                    SIMCONNECT_PERIOD.ONCE,
                    SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
                    0, 0, 0);
            }

            var result = await WaitPending(tcs, ct).ConfigureAwait(false);
            return result is DoubleValue dv ? dv.Value : Convert.ToDouble(result);
        }
        finally
        {
            _simOpGate.Release();
        }
    }

    public async Task<double[]> ReadSimVarsAsync(
        IReadOnlyList<(string Name, string Unit)> vars,
        CancellationToken ct = default)
    {
        if (vars is null || vars.Count == 0)
        {
            return Array.Empty<double>();
        }

        if (vars.Count > 32)
        {
            throw new SimClientException(
                "INVALID_ARGUMENT",
                "readSimVars supports at most 32 FLOAT64 SimVars");
        }

        var padded = vars.Count <= 8 ? 8 : vars.Count <= 16 ? 16 : vars.Count <= 24 ? 24 : 32;
        await _simOpGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var sim = RequireSim();
            uint defId;
            uint reqId;
            TaskCompletionSource<object> tcs;

            lock (_gate)
            {
                defId = EnsureBatchDef(sim, vars, padded);
                reqId = _nextReqId++;
                tcs = NewPending(reqId);
                sim.RequestDataOnSimObject(
                    (Requests)reqId,
                    (Definitions)defId,
                    SimConnect.SIMCONNECT_OBJECT_ID_USER,
                    SIMCONNECT_PERIOD.ONCE,
                    SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT,
                    0, 0, 0);
            }

            var result = await WaitPending(tcs, ct).ConfigureAwait(false);
            var unpacked = UnpackBatch(result, padded);
            var take = new double[vars.Count];
            Array.Copy(unpacked, take, vars.Count);
            return take;
        }
        finally
        {
            _simOpGate.Release();
        }
    }

    private static double[] UnpackBatch(object raw, int padded)
    {
        return padded switch
        {
            8 when raw is Batch8 b8 =>
                [b8.V0, b8.V1, b8.V2, b8.V3, b8.V4, b8.V5, b8.V6, b8.V7],
            16 when raw is Batch16 b16 =>
            [
                b16.V0, b16.V1, b16.V2, b16.V3, b16.V4, b16.V5, b16.V6, b16.V7,
                b16.V8, b16.V9, b16.V10, b16.V11, b16.V12, b16.V13, b16.V14, b16.V15,
            ],
            24 when raw is Batch24 b24 =>
            [
                b24.V0, b24.V1, b24.V2, b24.V3, b24.V4, b24.V5, b24.V6, b24.V7,
                b24.V8, b24.V9, b24.V10, b24.V11, b24.V12, b24.V13, b24.V14, b24.V15,
                b24.V16, b24.V17, b24.V18, b24.V19, b24.V20, b24.V21, b24.V22, b24.V23,
            ],
            32 when raw is Batch32 b32 =>
            [
                b32.V0, b32.V1, b32.V2, b32.V3, b32.V4, b32.V5, b32.V6, b32.V7,
                b32.V8, b32.V9, b32.V10, b32.V11, b32.V12, b32.V13, b32.V14, b32.V15,
                b32.V16, b32.V17, b32.V18, b32.V19, b32.V20, b32.V21, b32.V22, b32.V23,
                b32.V24, b32.V25, b32.V26, b32.V27, b32.V28, b32.V29, b32.V30, b32.V31,
            ],
            _ => throw new SimClientException("SIM_ERROR", "Unexpected batch payload type"),
        };
    }

    public async Task WriteSimVarAsync(string name, string unit, double value, CancellationToken ct = default)
    {
        await _simOpGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var sim = RequireSim();

            lock (_gate)
            {
                var defId = _nextDefId++;
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
        }
        finally
        {
            _simOpGate.Release();
        }
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

        var fuelTotal =
            (IsSaneQuantity(left) ? left : 0) +
            (IsSaneQuantity(right) ? right : 0) +
            (IsSaneQuantity(data.FuelCenter) ? data.FuelCenter : 0);

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
        AddIfSane(vars, "FUEL TANK CENTER QUANTITY", data.FuelCenter);
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

    public async Task<AirportFacilityDto> GetAirportFacilityAsync(string icao, CancellationToken ct = default)
    {
        _ = RequireSim();
        var code = (icao ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            throw new SimClientException("INVALID_PARAMS", "icao required");
        }

        if (_airportCache.TryGetValue(code, out var cached))
        {
            return cached;
        }

        await _facilityGate.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_airportCache.TryGetValue(code, out cached))
            {
                return cached;
            }

            if (_airportFacilityDefReady)
            {
                var viaFacility = await TryRequestFacilityDataAsync(code, ct).ConfigureAwait(false);
                if (viaFacility is not null)
                {
                    _airportCache[code] = viaFacility;
                    return viaFacility;
                }
            }

            await EnsureAirportListCachedAsync(ct).ConfigureAwait(false);
            if (_airportCache.TryGetValue(code, out cached))
            {
                return cached;
            }

            throw new SimClientException(
                "NOT_FOUND",
                $"Airport facility not found in MSFS scenery for {code}");
        }
        finally
        {
            _facilityGate.Release();
        }
    }

    private async Task<AirportFacilityDto?> TryRequestFacilityDataAsync(string code, CancellationToken ct)
    {
        var sim = RequireSim();
        var tcs = NewPending(Requests.AirportFacility);
        _facilityPartial = null;
        _facilityRunways.Clear();
        _facilityRequestIcao = code;

        try
        {
            lock (_gate)
            {
                sim.RequestFacilityData(Definitions.AirportFacility, Requests.AirportFacility, code, "");
            }

            var raw = await WaitPending(tcs, ct).ConfigureAwait(false);
            return raw as AirportFacilityDto;
        }
        catch (SimClientException ex) when (ex.Code is "TIMEOUT" or "SIM_ERROR")
        {
            Console.Error.WriteLine(
                $"[simconnect] RequestFacilityData({code}) failed: {ex.Code} {ex.Message}");
            _pending.TryRemove((uint)Requests.AirportFacility, out _);
            return null;
        }
        finally
        {
            _facilityRequestIcao = null;
            _facilityPartial = null;
            _facilityRunways.Clear();
        }
    }

    private async Task EnsureAirportListCachedAsync(CancellationToken ct)
    {
        if (_airportListComplete)
        {
            return;
        }

        TaskCompletionSource<bool> tcs;
        lock (_airportListGate)
        {
            if (_airportListComplete)
            {
                return;
            }

            if (_airportListTcs is null)
            {
                _airportListTcs = new TaskCompletionSource<bool>(
                    TaskCreationOptions.RunContinuationsAsynchronously);
                var sim = RequireSim();
                lock (_gate)
                {
                    sim.RequestFacilitiesList(SIMCONNECT_FACILITY_LIST_TYPE.AIRPORT, Requests.AirportList);
                }
            }

            tcs = _airportListTcs;
        }

        using var timeout = new CancellationTokenSource(15_000);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        await using var reg = linked.Token.Register(() =>
            tcs.TrySetException(new SimClientException(
                "TIMEOUT",
                "Timed out waiting for MSFS airport facilities list")));

        await tcs.Task.ConfigureAwait(false);
    }

    public async Task<PmdgNg3FuelDto> ReadPmdgNg3FuelAsync(CancellationToken ct = default)
    {
        var sim = RequireSim();

        double expectCenterLb = 0;
        double expectLeftLb = 0;
        double expectRightLb = 0;
        var dens = 6.7;
        try
        {
            dens = await ReadSimVarAsync("FUEL WEIGHT PER GALLON", "pounds", ct).ConfigureAwait(false);
            if (!IsSaneQuantity(dens) || dens < 5 || dens > 8)
            {
                dens = 6.7;
            }

            expectCenterLb = Math.Max(0, await ReadSimVarAsync("FUEL TANK CENTER QUANTITY", "gallons", ct).ConfigureAwait(false)) * dens;
            expectLeftLb = Math.Max(0, await ReadSimVarAsync("FUEL TANK LEFT MAIN QUANTITY", "gallons", ct).ConfigureAwait(false)) * dens;
            expectRightLb = Math.Max(0, await ReadSimVarAsync("FUEL TANK RIGHT MAIN QUANTITY", "gallons", ct).ConfigureAwait(false)) * dens;
        }
        catch
        {
            // optional for layout lock
        }

        TaskCompletionSource<object> tcs;
        lock (_gate)
        {
            EnsurePmdgNg3Subscribed(sim);
            tcs = NewPending((uint)ClientDataRequests.PmdgNg3DataOnce);
            RequestPmdgNg3DataOnce(sim);
        }

        try
        {
            using var timeout = new CancellationTokenSource(2000);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
            await using var reg = linked.Token.Register(() =>
                tcs.TrySetCanceled(linked.Token));
            _ = await tcs.Task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            _pending.TryRemove((uint)ClientDataRequests.PmdgNg3DataOnce, out _);
        }
        catch (SimClientException)
        {
            _pending.TryRemove((uint)ClientDataRequests.PmdgNg3DataOnce, out _);
        }

        lock (_pmdgFuelGate)
        {
            if (_pmdgRaw is null || _pmdgFuelUtc is null)
            {
                return new PmdgNg3FuelDto { Available = false, LayoutOk = false };
            }

            var bytes = _pmdgRaw;
            var ageMs = (long)(DateTime.UtcNow - _pmdgFuelUtc.Value).TotalMilliseconds;
            var nonzero = PmdgNg3ClientData.CountNonZero(bytes);

            float center = 0, left = 0, right = 0;
            var offset = _pmdgFuelOffset;
            if (offset < 0)
            {
                offset = PmdgNg3ClientData.FindFuelOffset(
                    bytes,
                    expectCenterLb,
                    expectLeftLb,
                    expectRightLb,
                    out center,
                    out left,
                    out right);
                if (offset >= 0)
                {
                    _pmdgFuelOffset = offset;
                    Console.WriteLine($"[simconnect] PMDG fuel locked via scan at offset {offset}");
                }
            }

            if (offset < 0)
            {
                // Fall back to SDK struct offsets from the managed layout mirror.
                offset = PmdgNg3ClientData.OffsetQtyCenter;
                PmdgNg3ClientData.TryReadFloat(bytes, PmdgNg3ClientData.OffsetQtyCenter, out center);
                PmdgNg3ClientData.TryReadFloat(bytes, PmdgNg3ClientData.OffsetQtyLeft, out left);
                PmdgNg3ClientData.TryReadFloat(bytes, PmdgNg3ClientData.OffsetQtyRight, out right);
                Console.WriteLine(
                    $"[simconnect] PMDG raw nonzero={nonzero}/916; struct offsets C/L/R=" +
                    $"{PmdgNg3ClientData.OffsetQtyCenter}/{PmdgNg3ClientData.OffsetQtyLeft}/{PmdgNg3ClientData.OffsetQtyRight} " +
                    $"values={center:F1}/{left:F1}/{right:F1} expect≈{expectCenterLb:F0}/{expectLeftLb:F0}/{expectRightLb:F0}");
            }
            else if (_pmdgFuelOffset >= 0)
            {
                PmdgNg3ClientData.TryReadFloat(bytes, offset, out center);
                PmdgNg3ClientData.TryReadFloat(bytes, offset + 4, out left);
                PmdgNg3ClientData.TryReadFloat(bytes, offset + 8, out right);
            }

            bool? weightInKg = null;
            if (PmdgNg3ClientData.TryReadFloat(bytes, PmdgNg3ClientData.OffsetWeightInKg, out _))
            {
                // WeightInKg is a bool at that offset — read as byte.
                if (PmdgNg3ClientData.OffsetWeightInKg < bytes.Length)
                {
                    weightInKg = bytes[PmdgNg3ClientData.OffsetWeightInKg] != 0;
                }
            }

            var layoutOk =
                nonzero > 0 &&
                left >= 0 && right >= 0 && center >= 0 &&
                left < 100_000 && right < 100_000 && center < 100_000 &&
                (expectLeftLb < 50 || RelClose(left, expectLeftLb) || RelClose(right, expectRightLb));

            return new PmdgNg3FuelDto
            {
                Available = true,
                LayoutOk = layoutOk,
                LayoutOffset = offset,
                LeftLb = left,
                RightLb = right,
                CenterLb = center,
                WeightInKg = weightInKg,
                AgeMs = ageMs,
                NonzeroBytes = nonzero
            };
        }
    }

    /// <summary>
    /// Send a PMDG control. Paths:
    /// <list type="bullet">
    /// <item><c>rotor</c> / <c>rotor_brake</c> — MSFS PMDG 777 CDU/switch standard:
    ///   <c>(offset*100+1) &gt;K:ROTOR_BRAKE</c> where offset = eventId − 0x11000.</item>
    /// <item><c>control</c> — SetClientData on <c>PMDG_NG3_Control</c> (737 NG3).</item>
    /// <item><c>event</c> (default) — TransmitClientEvent <c>#eventId</c> with mouse flags.</item>
    /// </list>
    /// </summary>
    public async Task SendPmdgNg3ControlAsync(
        uint eventId,
        uint parameter = 0,
        bool release = true,
        string method = "event",
        int holdMs = -1,
        CancellationToken ct = default)
    {
        var param = parameter == 0 ? PmdgNg3Cdu.MouseLeftSingle : parameter;
        var useRotor = string.Equals(method, "rotor", StringComparison.OrdinalIgnoreCase)
            || string.Equals(method, "rotor_brake", StringComparison.OrdinalIgnoreCase);
        var useControl = string.Equals(method, "control", StringComparison.OrdinalIgnoreCase);

        if (useRotor)
        {
            // MobiFlight / HubHop carrier: offset*100+1 = left click.
            // eventId is absolute (THIRD_PARTY_EVENT_ID_MIN + offset).
            const uint thirdPartyMin = 0x00011000;
            if (eventId < thirdPartyMin)
            {
                throw new SimClientException(
                    "INVALID",
                    $"PMDG rotor_brake eventId {eventId} below THIRD_PARTY_EVENT_ID_MIN");
            }

            var offset = eventId - thirdPartyMin;
            var rotorParam = offset * 100u + 1u;
            await TriggerEventAsync("ROTOR_BRAKE", rotorParam, ct).ConfigureAwait(false);
            Console.WriteLine(
                $"[simconnect] PMDG ROTOR_BRAKE EventId={eventId} offset={offset} param={rotorParam}");
            var pressHold = holdMs >= 0 ? holdMs : 50;
            if (pressHold > 0)
            {
                await DelayAsync(pressHold, ct).ConfigureAwait(false);
            }

            return;
        }

        if (useControl)
        {
            // One write per key, then EventId→0 clear only.
            // Give PMDG time to read the command before clearing — too-fast
            // clear drops LSKs (1234+567 merge → 1234567 INVALID; 89 lands on FWD).
            // holdMs>default: long-press CLR clears the whole scratchpad.
            var pressParam = parameter == 0 ? 1u : parameter;
            var pressHold = holdMs >= 0 ? holdMs : 150;
            await WritePmdgControlAsync(eventId, pressParam, track: true, ct)
                .ConfigureAwait(false);
            Console.WriteLine(
                $"[simconnect] PMDG control EventId={eventId} Parameter=0x{pressParam:X8} holdMs={pressHold}");
            await DelayAsync(pressHold, ct).ConfigureAwait(false);

            await WritePmdgControlAsync(0, 0, track: true, ct).ConfigureAwait(false);
            lock (_pmdgControlGate)
            {
                _pmdgControlEventId = 0;
            }

            await DelayAsync(80, ct).ConfigureAwait(false);
            return;
        }

        // TransmitClientEvent("#NNNNN") — preferred for 737 NG3 CDU keys.
        TransmitPmdgMappedEvent(eventId, param);
        Console.WriteLine(
            $"[simconnect] PMDG TransmitClientEvent #{eventId} Parameter=0x{param:X8}");

        if (release && param != PmdgNg3Cdu.MouseLeftRelease)
        {
            var pressHold = holdMs >= 0 ? holdMs : 50;
            await DelayAsync(pressHold, ct).ConfigureAwait(false);
            TransmitPmdgMappedEvent(eventId, PmdgNg3Cdu.MouseLeftRelease);
            Console.WriteLine(
                $"[simconnect] PMDG TransmitClientEvent #{eventId} Parameter=0x{PmdgNg3Cdu.MouseLeftRelease:X8} (release holdMs={pressHold})");
        }
    }

    private void TransmitPmdgMappedEvent(uint eventId, uint parameter)
    {
        var sim = RequireSim();
        lock (_gate)
        {
            // PMDG third-party events map as "#<absoluteEventId>" (see ConnectionTest.cpp).
            sim.MapClientEventToSimEvent(Events.Dynamic, $"#{eventId}");
            sim.TransmitClientEvent(
                SimConnect.SIMCONNECT_OBJECT_ID_USER,
                Events.Dynamic,
                parameter,
                Groups.Default,
                SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);
        }
    }

    private async Task SendPmdgControlViaClientDataAsync(uint eventId, uint param, CancellationToken ct)
    {
        await WritePmdgControlAsync(eventId, param, track: true, ct).ConfigureAwait(false);
        Console.WriteLine($"[simconnect] PMDG control set EventId={eventId} Parameter=0x{param:X8}");
        await DelayAsync(50, ct).ConfigureAwait(false);
    }

    private Task WritePmdgControlAsync(uint eventId, uint param, bool track, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        lock (_gate)
        {
            var sim = RequireSim();
            EnsurePmdgNg3ControlReady(sim);
            if (track)
            {
                lock (_pmdgControlGate)
                {
                    _pmdgControlEventId = eventId;
                }
            }

            var control = new PMDGNG3Control
            {
                EventId = eventId,
                Parameter = param
            };
            sim.SetClientData(
                ClientDataIds.PmdgNg3Control,
                ClientDataDefinitions.PmdgNg3Control,
                SIMCONNECT_CLIENT_DATA_SET_FLAG.DEFAULT,
                0,
                control);
        }

        return Task.CompletedTask;
    }

    private async Task WaitUntilControlEventIdleAsync(CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddMilliseconds(1500);
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            uint current;
            lock (_pmdgControlGate)
            {
                current = _pmdgControlEventId;
            }

            if (current == 0)
            {
                return;
            }

            if (DateTime.UtcNow > deadline)
            {
                throw new SimClientException(
                    "TIMEOUT",
                    $"Timed out waiting for PMDG_NG3_Control EventId to clear (still {current})");
            }

            await Task.Delay(20, ct).ConfigureAwait(false);
        }
    }

    private static bool RelClose(double actual, double expect)
    {
        var scale = Math.Max(Math.Abs(expect), 25.0);
        return Math.Abs(actual - expect) / scale < 0.08;
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync().ConfigureAwait(false);
        _messageEvent.Dispose();
        _facilityGate.Dispose();
    }

    private void RegisterFixedDefinitions(SimConnect sim)
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
        AddFloat(sim, Definitions.Snapshot, "FUEL TANK CENTER QUANTITY", "gallons");
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

        try
        {
            // Nested runway inside airport — CLOSE AIRPORT last.
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "OPEN AIRPORT");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "LATITUDE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "LONGITUDE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "ALTITUDE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "NAME");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "OPEN RUNWAY");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "LATITUDE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "LONGITUDE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "HEADING");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "LENGTH");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "WIDTH");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "SURFACE");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "PRIMARY_NUMBER");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "PRIMARY_DESIGNATOR");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "SECONDARY_NUMBER");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "SECONDARY_DESIGNATOR");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "CLOSE RUNWAY");
            sim.AddToFacilityDefinition(Definitions.AirportFacility, "CLOSE AIRPORT");
            // Cast key is facility type, not the definition id.
            sim.RegisterFacilityDataDefineStruct<AirportFacilityData>(SIMCONNECT_FACILITY_DATA_TYPE.AIRPORT);
            sim.RegisterFacilityDataDefineStruct<RunwayFacilityData>(SIMCONNECT_FACILITY_DATA_TYPE.RUNWAY);
            _airportFacilityDefReady = true;
        }
        catch (Exception ex)
        {
            _airportFacilityDefReady = false;
            Console.Error.WriteLine(
                $"[simconnect] Airport facility definition unavailable; list cache fallback only: {ex.Message}");
        }
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

    private void ClearDynamicDefCache()
    {
        _batchDefCache.Clear();
        _singleDefCache.Clear();
    }

    private static string BatchDefKey(IReadOnlyList<(string Name, string Unit)> vars, int padded)
    {
        var parts = new string[padded];
        for (var i = 0; i < padded; i++)
        {
            if (i < vars.Count)
            {
                parts[i] = vars[i].Name + "\t" + (NormalizeUnit(vars[i].Unit) ?? "");
            }
            else
            {
                parts[i] = "SIM ON GROUND\tBool";
            }
        }

        return padded + ":" + string.Join("\n", parts);
    }

    private uint EnsureBatchDef(
        SimConnect sim,
        IReadOnlyList<(string Name, string Unit)> vars,
        int padded)
    {
        var key = BatchDefKey(vars, padded);
        if (_batchDefCache.TryGetValue(key, out var cached))
        {
            return cached;
        }

        var defId = _nextDefId++;
        for (var i = 0; i < padded; i++)
        {
            var name = i < vars.Count ? vars[i].Name : "SIM ON GROUND";
            var unit = i < vars.Count ? vars[i].Unit : "Bool";
            sim.AddToDataDefinition(
                (Definitions)defId,
                name,
                NormalizeUnit(unit),
                SIMCONNECT_DATATYPE.FLOAT64,
                0.0f,
                SimConnect.SIMCONNECT_UNUSED);
        }

        switch (padded)
        {
            case 8:
                sim.RegisterDataDefineStruct<Batch8>((Definitions)defId);
                break;
            case 16:
                sim.RegisterDataDefineStruct<Batch16>((Definitions)defId);
                break;
            case 24:
                sim.RegisterDataDefineStruct<Batch24>((Definitions)defId);
                break;
            default:
                sim.RegisterDataDefineStruct<Batch32>((Definitions)defId);
                break;
        }

        if (_batchDefCache.Count < MaxCachedBatchDefs)
        {
            _batchDefCache[key] = defId;
            Console.WriteLine(
                $"[simconnect] cached batch def id={defId} pad={padded} vars={vars.Count}");
        }

        return defId;
    }

    private uint EnsureSingleDef(SimConnect sim, string name, string unit)
    {
        var key = name + "\t" + (NormalizeUnit(unit) ?? "");
        if (_singleDefCache.TryGetValue(key, out var cached))
        {
            return cached;
        }

        var defId = _nextDefId++;
        sim.AddToDataDefinition(
            (Definitions)defId,
            name,
            NormalizeUnit(unit),
            SIMCONNECT_DATATYPE.FLOAT64,
            0.0f,
            SimConnect.SIMCONNECT_UNUSED);
        sim.RegisterDataDefineStruct<DoubleValue>((Definitions)defId);
        if (_singleDefCache.Count < MaxCachedSingleDefs)
        {
            _singleDefCache[key] = defId;
        }

        return defId;
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

    private async Task<object> WaitPending(TaskCompletionSource<object> tcs, CancellationToken ct)
    {
        using var timeout = new CancellationTokenSource(RequestTimeoutMs);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);
        await using var reg = linked.Token.Register(() =>
            tcs.TrySetException(new SimClientException("TIMEOUT", "SimConnect request timed out")));

        try
        {
            return await tcs.Task.ConfigureAwait(false);
        }
        catch
        {
            if (timeout.IsCancellationRequested && !ct.IsCancellationRequested)
            {
                NoteTimeout();
            }
            throw;
        }
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
                    // 0xC00000B0 / pipe-broken: session is dead. Tear down here so
                    // IsConnected flips and the next IPC "connect" can reopen —
                    // do NOT await DisconnectAsync (it waits for this loop).
                    Console.Error.WriteLine($"[simconnect] ReceiveMessage error: {ex.Message}");
                    TearDownAfterRecvFailure();
                    return;
                }
            }

            if (Volatile.Read(ref _pendingSessionTearDown) != 0)
            {
                TearDownAfterRecvFailure();
                return;
            }
        }
    }

    /// <summary>
    /// Drop a dead SimConnect handle without joining the receive loop (we're on it).
    /// </summary>
    private void ResetSessionHealth()
    {
        Interlocked.Exchange(ref _lastHealthyRecvUtcTicks, 0);
        Interlocked.Exchange(ref _consecutiveUnrecognizedId, 0);
        Interlocked.Exchange(ref _consecutiveTimeouts, 0);
        Interlocked.Exchange(ref _pendingSessionTearDown, 0);
    }

    private void NoteHealthyRecv()
    {
        Interlocked.Exchange(ref _lastHealthyRecvUtcTicks, DateTime.UtcNow.Ticks);
        Interlocked.Exchange(ref _consecutiveUnrecognizedId, 0);
        Interlocked.Exchange(ref _consecutiveTimeouts, 0);
    }

    private void NoteTimeout()
    {
        var n = Interlocked.Increment(ref _consecutiveTimeouts);
        if (n >= TimeoutStormLimit)
        {
            Console.Error.WriteLine($"[simconnect] timeout storm ({n}) — tearing down session");
            TearDownAfterRecvFailure();
        }
    }

    private void RequestSessionTearDown(string reason)
    {
        if (Interlocked.Exchange(ref _pendingSessionTearDown, 1) != 0)
        {
            return;
        }

        Console.Error.WriteLine($"[simconnect] {reason} — tearing down session");
    }

    private void TearDownAfterRecvFailure()
    {
        lock (_gate)
        {
            if (_sim is not null)
            {
                try { _sim.Dispose(); }
                catch { /* ignore */ }
                _sim = null;
            }

            _openReceived = false;
            ClearDynamicDefCache();
            ResetSessionHealth();
            _pmdgNg3Subscribed = false;
            _pmdgControlSubscribed = false;
            lock (_pmdgFuelGate)
            {
                _pmdgRaw = null;
                _pmdgFuelUtc = null;
                _pmdgFuelOffset = -1;
            }
            lock (_pmdgControlGate)
            {
                _pmdgControlEventId = 0;
            }
            _airportFacilityDefReady = false;
            _airportListComplete = false;
            _facilityPartial = null;
            _facilityRequestIcao = null;
            _airportCache.Clear();
            lock (_airportListGate)
            {
                _airportListTcs?.TrySetCanceled();
                _airportListTcs = null;
            }
            try { _recvCts?.Cancel(); }
            catch { /* ignore */ }
        }

        FailAllPending("NOT_CONNECTED", "SimConnect receive failed");
        Console.Error.WriteLine("[simconnect] session dropped — next client connect() will reopen");
    }

    private void OnRecvOpen(SimConnect sender, SIMCONNECT_RECV_OPEN data)
    {
        _openReceived = true;
        NoteHealthyRecv();
        Console.WriteLine($"[simconnect] connected app={data.szApplicationName}");
    }

    private void EnsurePmdgNg3Subscribed(SimConnect sim)
    {
        if (_pmdgNg3Subscribed)
        {
            return;
        }

        // Managed receive uses a blittable 916-byte RawBlob (typed PMDGNG3DataStruct
        // does not fill reliably through RegisterStruct for non-blittable layouts).
        sim.MapClientDataNameToID(PmdgNg3ClientData.DataAreaName, ClientDataIds.PmdgNg3);
        sim.AddToClientDataDefinition(
            ClientDataDefinitions.PmdgNg3Data,
            0,
            916,
            0,
            SimConnect.SIMCONNECT_UNUSED);
        sim.RegisterStruct<SIMCONNECT_RECV_CLIENT_DATA, PmdgNg3ClientData.RawBlob>(
            ClientDataDefinitions.PmdgNg3Data);
        sim.RequestClientData(
            ClientDataIds.PmdgNg3,
            ClientDataRequests.PmdgNg3Data,
            ClientDataDefinitions.PmdgNg3Data,
            SIMCONNECT_CLIENT_DATA_PERIOD.SECOND,
            SIMCONNECT_CLIENT_DATA_REQUEST_FLAG.DEFAULT,
            0,
            0,
            0);
        _pmdgNg3Subscribed = true;
        Console.WriteLine(
            $"[simconnect] subscribed to PMDG_NG3_Data raw 916-byte blob; " +
            $"QtyCenter/Left/Right offsets={PmdgNg3ClientData.OffsetQtyCenter}/" +
            $"{PmdgNg3ClientData.OffsetQtyLeft}/{PmdgNg3ClientData.OffsetQtyRight}");
    }

    private void EnsurePmdgNg3ControlReady(SimConnect sim)
    {
        if (_pmdgControlSubscribed)
        {
            return;
        }

        sim.MapClientDataNameToID(PmdgNg3ClientData.ControlAreaName, ClientDataIds.PmdgNg3Control);
        sim.AddToClientDataDefinition(
            ClientDataDefinitions.PmdgNg3Control,
            0,
            PmdgNg3ClientData.ControlSize,
            0,
            SimConnect.SIMCONNECT_UNUSED);
        sim.RegisterStruct<SIMCONNECT_RECV_CLIENT_DATA, PMDGNG3Control>(
            ClientDataDefinitions.PmdgNg3Control);
        // ON_SET + CHANGED so we see Event cleared to 0 after PMDG processes the write.
        sim.RequestClientData(
            ClientDataIds.PmdgNg3Control,
            ClientDataRequests.PmdgNg3Control,
            ClientDataDefinitions.PmdgNg3Control,
            SIMCONNECT_CLIENT_DATA_PERIOD.ON_SET,
            SIMCONNECT_CLIENT_DATA_REQUEST_FLAG.CHANGED,
            0,
            0,
            0);
        _pmdgControlSubscribed = true;
        Console.WriteLine(
            $"[simconnect] PMDG_NG3_Control ready (size={PmdgNg3ClientData.ControlSize})");
    }

    private void RequestPmdgNg3DataOnce(SimConnect sim)
    {
        if (!_pmdgNg3Subscribed)
        {
            return;
        }

        sim.RequestClientData(
            ClientDataIds.PmdgNg3,
            ClientDataRequests.PmdgNg3DataOnce,
            ClientDataDefinitions.PmdgNg3Data,
            SIMCONNECT_CLIENT_DATA_PERIOD.ONCE,
            SIMCONNECT_CLIENT_DATA_REQUEST_FLAG.DEFAULT,
            0,
            0,
            0);
    }

    private void OnRecvClientData(SimConnect sender, SIMCONNECT_RECV_CLIENT_DATA data)
    {
        NoteHealthyRecv();
        if (data.dwRequestID == (uint)ClientDataRequests.PmdgNg3Control)
        {
            try
            {
                if (data.dwData is null || data.dwData.Length == 0)
                {
                    return;
                }

                if (data.dwData[0] is PMDGNG3Control control)
                {
                    lock (_pmdgControlGate)
                    {
                        _pmdgControlEventId = control.EventId;
                    }
                }
                else
                {
                    Console.Error.WriteLine(
                        $"[simconnect] PMDG control unexpected type: {data.dwData[0]?.GetType().FullName ?? "null"}");
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[simconnect] PMDG control parse error: {ex.Message}");
            }

            return;
        }

        if (data.dwRequestID != (uint)ClientDataRequests.PmdgNg3Data &&
            data.dwRequestID != (uint)ClientDataRequests.PmdgNg3DataOnce)
        {
            return;
        }

        try
        {
            if (data.dwData is null || data.dwData.Length == 0)
            {
                return;
            }

            if (data.dwData[0] is not PmdgNg3ClientData.RawBlob blob)
            {
                Console.Error.WriteLine(
                    $"[simconnect] PMDG client data unexpected type: {data.dwData[0]?.GetType().FullName ?? "null"}");
                return;
            }

            var bytes = PmdgNg3ClientData.ToBytes(blob);
            lock (_pmdgFuelGate)
            {
                _pmdgRaw = bytes;
                _pmdgFuelUtc = DateTime.UtcNow;
            }

            if (_pending.TryRemove(data.dwRequestID, out var tcs))
            {
                tcs.TrySetResult(bytes);
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[simconnect] PMDG client data parse error: {ex.Message}");
        }
    }


    private void OnRecvQuit(SimConnect sender, SIMCONNECT_RECV data)
    {
        Console.WriteLine("[simconnect] simulator quit — tearing down session");
        TearDownAfterRecvFailure();
    }

    private void OnRecvException(SimConnect sender, SIMCONNECT_RECV_EXCEPTION data)
    {
        // 3 = UNRECOGNIZED_ID — often harmless leftover from ClearDataDefinition.
        // 31 = invalid data size (e.g. Client Data request larger than published area).
        var hint = data.dwException switch
        {
            3 => " (UNRECOGNIZED_ID)",
            29 => " (DUPLICATE_ID — client-data datumId collision)",
            31 => " (OUT_OF_BOUNDS — client-data blob too large?)",
            _ => ""
        };
        Console.Error.WriteLine(
            $"[simconnect] exception={data.dwException}{hint} sendId={data.dwSendID} index={data.dwIndex}");
        // Do not cancel pending on a single exception 3 — write-path noise was stealing verifies.
        if (data.dwException == 3)
        {
            var n = Interlocked.Increment(ref _consecutiveUnrecognizedId);
            if (n >= UnrecognizedIdStormLimit)
            {
                RequestSessionTearDown($"unrecognized_id storm ({n})");
            }
        }
    }

    private void OnRecvSimobjectData(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA data)
    {
        NoteHealthyRecv();
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

    private void OnRecvFacilityData(SimConnect sender, SIMCONNECT_RECV_FACILITY_DATA data)
    {
        NoteHealthyRecv();
        if (data.UserRequestId != (uint)Requests.AirportFacility)
        {
            return;
        }

        try
        {
            if (data.Data is null || data.Data.Length == 0)
            {
                return;
            }

            if (data.Type == (uint)SIMCONNECT_FACILITY_DATA_TYPE.AIRPORT)
            {
                if (data.Data[0] is not AirportFacilityData raw)
                {
                    Console.Error.WriteLine(
                        $"[simconnect] facility airport unexpected type: {data.Data[0]?.GetType().FullName ?? "null"}");
                    return;
                }

                var icao = _facilityRequestIcao ?? "";
                _facilityPartial = new AirportFacilityDto
                {
                    Icao = icao,
                    Name = EmptyToNull(raw.Name),
                    Lat = raw.Latitude,
                    Lon = raw.Longitude,
                    AltMeters = double.IsFinite(raw.Altitude) ? raw.Altitude : null,
                };
                return;
            }

            if (data.Type == (uint)SIMCONNECT_FACILITY_DATA_TYPE.RUNWAY)
            {
                if (data.Data[0] is not RunwayFacilityData raw)
                {
                    Console.Error.WriteLine(
                        $"[simconnect] facility runway unexpected type: {data.Data[0]?.GetType().FullName ?? "null"}");
                    return;
                }

                var mapped = MapRunwayFacility(raw);
                if (mapped is not null)
                {
                    _facilityRunways.Add(mapped);
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[simconnect] facility data parse error: {ex.Message}");
        }
    }

    private void OnRecvFacilityDataEnd(SimConnect sender, SIMCONNECT_RECV_FACILITY_DATA_END data)
    {
        if (data.RequestId != (uint)Requests.AirportFacility)
        {
            return;
        }

        if (!_pending.TryRemove(data.RequestId, out var tcs))
        {
            return;
        }

        var dto = _facilityPartial;
        if (dto is null ||
            !double.IsFinite(dto.Lat) ||
            !double.IsFinite(dto.Lon) ||
            (dto.Lat == 0 && dto.Lon == 0))
        {
            tcs.TrySetException(new SimClientException(
                "NOT_FOUND",
                $"No facility coords returned for {_facilityRequestIcao ?? "?"}"));
            return;
        }

        dto.Runways = _facilityRunways.ToList();
        tcs.TrySetResult(dto);
    }

    private static AirportRunwayDto? MapRunwayFacility(RunwayFacilityData raw)
    {
        if (!double.IsFinite(raw.Latitude) || !double.IsFinite(raw.Longitude))
        {
            return null;
        }

        if (raw.Latitude == 0 && raw.Longitude == 0)
        {
            return null;
        }

        if (!float.IsFinite(raw.Length) || raw.Length < 5)
        {
            return null;
        }

        if (!float.IsFinite(raw.Width) || raw.Width <= 0)
        {
            return null;
        }

        var ident = FormatRunwayEnd(raw.PrimaryNumber, raw.PrimaryDesignator);
        if (string.IsNullOrEmpty(ident))
        {
            return null;
        }

        var reciprocal = FormatRunwayEnd(raw.SecondaryNumber, raw.SecondaryDesignator);
        var heading = float.IsFinite(raw.Heading) ? (double)raw.Heading : 0;
        while (heading < 0) heading += 360;
        while (heading >= 360) heading -= 360;

        return new AirportRunwayDto
        {
            Ident = ident,
            IdentReciprocal = reciprocal,
            HeadingTrueDeg = heading,
            LengthM = raw.Length,
            WidthM = raw.Width,
            Lat = raw.Latitude,
            Lon = raw.Longitude,
            Surface = MapSurface(raw.Surface),
        };
    }

    private static string? FormatRunwayEnd(int number, int designator)
    {
        string? num = number switch
        {
            0 => null,
            >= 1 and <= 36 => number.ToString(System.Globalization.CultureInfo.InvariantCulture),
            37 => "N",
            38 => "NE",
            39 => "E",
            40 => "SE",
            41 => "S",
            42 => "SW",
            43 => "W",
            44 => "NW",
            _ => null,
        };
        if (num is null)
        {
            return null;
        }

        var des = designator switch
        {
            1 => "L",
            2 => "R",
            3 => "C",
            4 => "W",
            5 => "A",
            6 => "B",
            _ => "",
        };
        return num + des;
    }

    private static string MapSurface(int surface) => surface switch
    {
        0 or 23 => "concrete", // CONCRETE / TARMAC
        1 or 5 or 6 or 7 => "grass",
        4 or 17 => "asphalt", // ASPHALT / BITUMINUS
        12 or 21 => "dirt", // DIRT / SAND
        14 or 19 => "gravel", // GRAVEL / MACADAM
        2 or 26 or 27 or 28 or 29 or 30 => "water",
        _ => "other",
    };

    private void OnRecvAirportList(SimConnect sender, SIMCONNECT_RECV_AIRPORT_LIST data)
    {
        NoteHealthyRecv();
        try
        {
            if (data.rgData is not null)
            {
                foreach (var item in data.rgData)
                {
                    if (item is not SIMCONNECT_DATA_FACILITY_AIRPORT ap)
                    {
                        continue;
                    }

                    var ident = (ap.Ident ?? "").Trim().ToUpperInvariant();
                    if (string.IsNullOrEmpty(ident))
                    {
                        continue;
                    }

                    if (!double.IsFinite(ap.Latitude) || !double.IsFinite(ap.Longitude))
                    {
                        continue;
                    }

                    if (ap.Latitude == 0 && ap.Longitude == 0)
                    {
                        continue;
                    }

                    // Prefer first hit; RequestFacilityData path overwrites with richer name later.
                    _airportCache.TryAdd(ident, new AirportFacilityDto
                    {
                        Icao = ident,
                        Region = EmptyToNull(ap.Region),
                        Lat = ap.Latitude,
                        Lon = ap.Longitude,
                        AltMeters = double.IsFinite(ap.Altitude) ? ap.Altitude : null,
                    });
                }
            }

            var received = data.dwEntryNumber + data.dwArraySize;
            if (received >= data.dwOutOf)
            {
                _airportListComplete = true;
                lock (_airportListGate)
                {
                    _airportListTcs?.TrySetResult(true);
                    _airportListTcs = null;
                }

                Console.WriteLine($"[simconnect] airport list cached ({_airportCache.Count} entries)");
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[simconnect] airport list parse error: {ex.Message}");
            lock (_airportListGate)
            {
                _airportListTcs?.TrySetException(
                    new SimClientException("SIM_ERROR", $"Airport list failed: {ex.Message}"));
                _airportListTcs = null;
            }
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
