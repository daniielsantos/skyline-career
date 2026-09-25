namespace SimBridgeHost.Sim;

using System.Collections.Concurrent;
using SimBridgeHost.Ipc;
using SimBridgeHost.Sim.Pmdg;

/// <summary>
/// In-memory SimConnect stand-in for local development without MSFS.
/// Seeds C172-like tanks/stations so the TypeScript ProfileEngine can be smoke-tested.
/// </summary>
public sealed class MockSimClient : ISimClient
{
    private readonly ConcurrentDictionary<string, double> _simVars = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, double> _lvars = new(StringComparer.OrdinalIgnoreCase);
    private bool _connected;

    public string Mode => "mock";
    public bool IsConnected => _connected;

    public SimSessionHealthDto GetSessionHealth() => new()
    {
        Connected = _connected,
        SessionHealthy = _connected,
        LastRecvAgeMs = _connected ? 0 : null,
        ConsecutiveTimeouts = 0,
    };

    public MockSimClient()
    {
        SeedDefaults();
    }

    public Task ConnectAsync(string appName, CancellationToken ct = default)
    {
        _connected = true;
        return Task.CompletedTask;
    }

    public Task DisconnectAsync(CancellationToken ct = default)
    {
        _connected = false;
        return Task.CompletedTask;
    }

    public Task<double> ReadSimVarAsync(string name, string unit, CancellationToken ct = default)
    {
        EnsureConnected();
        var key = Key(name, unit);
        return Task.FromResult(_simVars.TryGetValue(key, out var value) ? value : 0);
    }

    public async Task<double[]> ReadSimVarsAsync(
        IReadOnlyList<(string Name, string Unit)> vars,
        CancellationToken ct = default)
    {
        var values = new double[vars.Count];
        for (var i = 0; i < vars.Count; i++)
        {
            values[i] = await ReadSimVarAsync(vars[i].Name, vars[i].Unit, ct).ConfigureAwait(false);
        }

        return values;
    }

    public Task WriteSimVarAsync(string name, string unit, double value, CancellationToken ct = default)
    {
        EnsureConnected();
        _simVars[Key(name, unit)] = value;
        SyncDerived(name, unit, value);
        return Task.CompletedTask;
    }

    public Task<double> ReadLVarAsync(string name, CancellationToken ct = default)
    {
        EnsureConnected();
        return Task.FromResult(_lvars.TryGetValue(name, out var value) ? value : 0);
    }

    public Task WriteLVarAsync(string name, double value, CancellationToken ct = default)
    {
        EnsureConnected();
        _lvars[name] = value;
        return Task.CompletedTask;
    }

    public Task TriggerHVarAsync(string name, CancellationToken ct = default)
    {
        EnsureConnected();
        // Mock: no-op success. Real host will map H: events via WASM bridge later.
        return Task.CompletedTask;
    }

    public Task TriggerEventAsync(string eventName, uint data = 0, CancellationToken ct = default)
    {
        EnsureConnected();
        return Task.CompletedTask;
    }

    public Task DelayAsync(int ms, CancellationToken ct = default)
        => Task.Delay(Math.Max(0, ms), ct);

    public Task<SimSnapshotDto> SnapshotAsync(CancellationToken ct = default)
    {
        EnsureConnected();

        var left = Get("FUEL TANK LEFT MAIN QUANTITY", "gallons");
        var right = Get("FUEL TANK RIGHT MAIN QUANTITY", "gallons");
        var fuelTotal = left + right;

        double payload = 0;
        for (var i = 1; i <= 5; i++)
        {
            payload += Get($"PAYLOAD STATION WEIGHT:{i}", "pounds");
        }

        var vars = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["FUEL TANK LEFT MAIN QUANTITY"] = left,
            ["FUEL TANK RIGHT MAIN QUANTITY"] = right,
            ["FUEL TOTAL QUANTITY"] = fuelTotal,
            ["TOTAL PAYLOAD WEIGHT"] = payload,
            ["CG PERCENT"] = Get("CG PERCENT", "Percent over 100"),
            ["TOTAL WEIGHT"] = Get("TOTAL WEIGHT", "pounds"),
            ["SIM ON GROUND"] = Get("SIM ON GROUND", "Bool"),
            ["BRAKE PARKING POSITION"] = Get("BRAKE PARKING POSITION", "Bool"),
            ["ENG COMBUSTION:1"] = Get("ENG COMBUSTION:1", "Bool"),
        };

        return Task.FromResult(new SimSnapshotDto
        {
            OnGround = Get("SIM ON GROUND", "Bool") > 0.5,
            EnginesRunning = Get("ENG COMBUSTION:1", "Bool") > 0.5,
            ParkingBrake = Get("BRAKE PARKING POSITION", "Bool") > 0.5,
            Paused = Get("IS PAUSED", "Bool") > 0.5,
            SlewActive = Get("IS SLEW ACTIVE", "Bool") > 0.5,
            SimRate = Get("SIMULATION RATE", "Number"),
            CgPercent = Get("CG PERCENT", "Percent over 100"),
            GrossWeightLb = Get("TOTAL WEIGHT", "pounds"),
            FuelTotal = fuelTotal,
            PayloadTotal = payload,
            Vars = vars
        });
    }

    public Task<AircraftIdentityDto> GetAircraftIdentityAsync(CancellationToken ct = default)
    {
        EnsureConnected();
        return Task.FromResult(new AircraftIdentityDto
        {
            Title = "Cessna 172 Skyhawk G1000",
            AtcModel = "C172",
            AtcType = "Cessna",
            Icao = "C172"
        });
    }

    public Task<AirportFacilityDto> GetAirportFacilityAsync(string icao, CancellationToken ct = default)
    {
        EnsureConnected();
        var code = (icao ?? "").Trim().ToUpperInvariant();
        if (string.IsNullOrEmpty(code))
        {
            throw new SimClientException("INVALID_PARAMS", "icao required");
        }

        // Seeded MSFS-validated bush hubs for offline homologation tests.
        if (MockAirports.TryGetValue(code, out var hit))
        {
            return Task.FromResult(hit);
        }

        throw new SimClientException("NOT_FOUND", $"Mock has no airport facility for {code}");
    }

    private static readonly Dictionary<string, AirportFacilityDto> MockAirports = new(StringComparer.OrdinalIgnoreCase)
    {
        ["O64"] = new AirportFacilityDto
        {
            Icao = "O64",
            Name = "Breckenridge",
            Lat = 35.3627,
            Lon = -118.8561,
            AltMeters = 215,
            Runways =
            {
                new AirportRunwayDto
                {
                    Ident = "12",
                    IdentReciprocal = "30",
                    HeadingTrueDeg = 135,
                    LengthM = 1128,
                    WidthM = 18,
                    Lat = 35.3627,
                    Lon = -118.8561,
                    Surface = "dirt",
                },
            },
        },
        ["O67"] = new AirportFacilityDto
        {
            Icao = "O67",
            Name = "Manzanar Airport",
            Lat = 36.7372,
            Lon = -118.145,
            AltMeters = 1166,
            Runways =
            {
                new AirportRunwayDto
                {
                    Ident = "15",
                    IdentReciprocal = "33",
                    HeadingTrueDeg = 160,
                    LengthM = 1100,
                    WidthM = 18,
                    Lat = 36.7372,
                    Lon = -118.145,
                    Surface = "dirt",
                },
            },
        },
        ["26A"] = new AirportFacilityDto
        {
            Icao = "26A",
            Name = "Ashland/Lineville",
            Lat = 33.2842,
            Lon = -85.8086,
        },
        ["CA51"] = new AirportFacilityDto
        {
            Icao = "CA51",
            Name = "The Sea Ranch",
            Lat = 38.7046,
            Lon = -123.433,
        },
    };

    public Task<PmdgNg3FuelDto> ReadPmdgNg3FuelAsync(CancellationToken ct = default)
    {
        EnsureConnected();
        var mockPmdg = string.Equals(
            Environment.GetEnvironmentVariable("MSFS_COMPAT_MOCK_PMDG"),
            "1",
            StringComparison.Ordinal);
        if (!mockPmdg)
        {
            return Task.FromResult(new PmdgNg3FuelDto { Available = false });
        }

        return Task.FromResult(new PmdgNg3FuelDto
        {
            Available = true,
            LayoutOk = true,
            LayoutOffset = 0,
            LeftLb = 8629,
            RightLb = 8629,
            CenterLb = 7743,
            WeightInKg = false,
            AgeMs = 0
        });
    }

    public Task SendPmdgNg3ControlAsync(
        uint eventId,
        uint parameter = 0,
        bool release = true,
        string method = "event",
        int holdMs = -1,
        CancellationToken ct = default)
    {
        EnsureConnected();
        var param = parameter == 0 ? PmdgNg3Cdu.MouseLeftSingle : parameter;
        Console.WriteLine(
            $"[mock] sendPmdgNg3Control method={method} eventId={eventId} parameter={param} release={release} holdMs={holdMs}" +
            (string.Equals(method, "rotor", StringComparison.OrdinalIgnoreCase)
             || string.Equals(method, "rotor_brake", StringComparison.OrdinalIgnoreCase)
                ? $" rotor={(eventId >= 0x11000u ? (eventId - 0x11000u) * 100u + 1u : 0u)}"
                : ""));
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    private void SeedDefaults()
    {
        Set("SIM ON GROUND", "Bool", 1);
        Set("BRAKE PARKING POSITION", "Bool", 1);
        Set("ENG COMBUSTION:1", "Bool", 0);
        Set("IS PAUSED", "Bool", 0);
        Set("IS SLEW ACTIVE", "Bool", 0);
        Set("SIMULATION RATE", "Number", 1);
        Set("CG PERCENT", "Percent over 100", 28.0);
        Set("TOTAL WEIGHT", "pounds", 2300);
        Set("FUEL TANK LEFT MAIN QUANTITY", "gallons", 20);
        Set("FUEL TANK RIGHT MAIN QUANTITY", "gallons", 20);
        Set("FUEL TOTAL QUANTITY", "gallons", 40);
        Set("PAYLOAD STATION WEIGHT:1", "pounds", 170);
        Set("PAYLOAD STATION WEIGHT:2", "pounds", 0);
        Set("PAYLOAD STATION WEIGHT:3", "pounds", 0);
        Set("PAYLOAD STATION WEIGHT:4", "pounds", 0);
        Set("PAYLOAD STATION WEIGHT:5", "pounds", 30);
        Set("TOTAL PAYLOAD WEIGHT", "pounds", 200);
        Set("TITLE", "String", 0); // title comes from GetAircraftIdentity
    }

    private void SyncDerived(string name, string unit, double value)
    {
        if (name.StartsWith("FUEL TANK", StringComparison.OrdinalIgnoreCase) ||
            name.Equals("FUEL TOTAL QUANTITY", StringComparison.OrdinalIgnoreCase))
        {
            var left = Get("FUEL TANK LEFT MAIN QUANTITY", "gallons");
            var right = Get("FUEL TANK RIGHT MAIN QUANTITY", "gallons");
            Set("FUEL TOTAL QUANTITY", "gallons", left + right);
        }

        if (name.StartsWith("PAYLOAD STATION WEIGHT", StringComparison.OrdinalIgnoreCase))
        {
            double payload = 0;
            for (var i = 1; i <= 5; i++)
            {
                payload += Get($"PAYLOAD STATION WEIGHT:{i}", "pounds");
            }
            Set("TOTAL PAYLOAD WEIGHT", "pounds", payload);
        }
    }

    private void EnsureConnected()
    {
        if (!_connected)
        {
            throw new SimClientException("NOT_CONNECTED", "Mock sim client is not connected");
        }
    }

    private static string Key(string name, string unit) => $"{name}|{unit}";

    private double Get(string name, string unit)
        => _simVars.TryGetValue(Key(name, unit), out var value) ? value : 0;

    private void Set(string name, string unit, double value)
        => _simVars[Key(name, unit)] = value;
}
