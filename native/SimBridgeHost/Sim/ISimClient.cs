namespace SimBridgeHost.Sim;

using SimBridgeHost.Ipc;
using SimBridgeHost.Sim.Pmdg;

public interface ISimClient : IAsyncDisposable
{
    string Mode { get; }
    bool IsConnected { get; }

    Task ConnectAsync(string appName, CancellationToken ct = default);
    Task DisconnectAsync(CancellationToken ct = default);
    Task<double> ReadSimVarAsync(string name, string unit, CancellationToken ct = default);
    Task WriteSimVarAsync(string name, string unit, double value, CancellationToken ct = default);
    Task<double> ReadLVarAsync(string name, CancellationToken ct = default);
    Task WriteLVarAsync(string name, double value, CancellationToken ct = default);
    Task TriggerHVarAsync(string name, CancellationToken ct = default);
    Task TriggerEventAsync(string eventName, uint data = 0, CancellationToken ct = default);
    Task<SimSnapshotDto> SnapshotAsync(CancellationToken ct = default);
    Task DelayAsync(int ms, CancellationToken ct = default);
    Task<AircraftIdentityDto> GetAircraftIdentityAsync(CancellationToken ct = default);
    Task<PmdgNg3FuelDto> ReadPmdgNg3FuelAsync(CancellationToken ct = default);
}

public sealed class SimClientException : Exception
{
    public string Code { get; }

    public SimClientException(string code, string message) : base(message)
    {
        Code = code;
    }
}
