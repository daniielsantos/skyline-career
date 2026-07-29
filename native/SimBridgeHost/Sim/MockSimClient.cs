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
