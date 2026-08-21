namespace SimBridgeHost.Sim;

using System.Collections.Generic;
using SimBridgeHost.Ipc;
using SimBridgeHost.Sim.Pmdg;

public interface ISimClient : IAsyncDisposable
{
    string Mode { get; }
    bool IsConnected { get; }
    SimSessionHealthDto GetSessionHealth();

    Task ConnectAsync(string appName, CancellationToken ct = default);
    Task DisconnectAsync(CancellationToken ct = default);
    Task<double> ReadSimVarAsync(string name, string unit, CancellationToken ct = default);
    /// <summary>One SimConnect data definition / one pending wait for many FLOAT64 vars.</summary>
    Task<double[]> ReadSimVarsAsync(
        IReadOnlyList<(string Name, string Unit)> vars,
        CancellationToken ct = default);
    Task WriteSimVarAsync(string name, string unit, double value, CancellationToken ct = default);
    Task<double> ReadLVarAsync(string name, CancellationToken ct = default);
    Task WriteLVarAsync(string name, double value, CancellationToken ct = default);
    Task TriggerHVarAsync(string name, CancellationToken ct = default);
    Task TriggerEventAsync(string eventName, uint data = 0, CancellationToken ct = default);
    Task<SimSnapshotDto> SnapshotAsync(CancellationToken ct = default);
    Task DelayAsync(int ms, CancellationToken ct = default);
    Task<AircraftIdentityDto> GetAircraftIdentityAsync(CancellationToken ct = default);
    /// <summary>
    /// Look up an airport in the MSFS scenery database by ICAO (no need to be at the field).
    /// </summary>
    Task<AirportFacilityDto> GetAirportFacilityAsync(string icao, CancellationToken ct = default);
    Task<PmdgNg3FuelDto> ReadPmdgNg3FuelAsync(CancellationToken ct = default);
    /// <summary>
    /// Send a PMDG NG3 control. Prefer <c>method=event</c> (TransmitClientEvent <c>#id</c>)
    /// for CDU/momentary keys — matches ConnectionTest FD switch. <c>method=control</c>
    /// uses <c>PMDG_NG3_Control</c> SetClientData. When <paramref name="parameter"/> is 0,
    /// defaults to <see cref="PmdgNg3Cdu.MouseLeftSingle"/>.
    /// <paramref name="holdMs"/> keeps the key pressed before release/clear (CLR long-press
    /// clears the whole scratchpad; default 150ms for control, 50ms for event).
    /// </summary>
    Task SendPmdgNg3ControlAsync(
        uint eventId,
        uint parameter = 0,
        bool release = true,
        string method = "event",
        int holdMs = -1,
        CancellationToken ct = default);
}

public sealed class SimClientException : Exception
{
    public string Code { get; }

    public SimClientException(string code, string message) : base(message)
    {
        Code = code;
    }
}
