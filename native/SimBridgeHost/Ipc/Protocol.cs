using System.Text.Json;
using System.Text.Json.Serialization;

namespace SimBridgeHost.Ipc;

public sealed class IpcRequest
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "request";

    [JsonPropertyName("method")]
    public string Method { get; set; } = "";

    [JsonPropertyName("params")]
    public JsonElement? Params { get; set; }
}

public sealed class IpcError
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = "INTERNAL";

    [JsonPropertyName("message")]
    public string Message { get; set; } = "";
}

public sealed class IpcResponse
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "response";

    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("result")]
    public object? Result { get; set; }

    [JsonPropertyName("error")]
    public IpcError? Error { get; set; }

    public static IpcResponse Success(string id, object? result) => new()
    {
        Id = id,
        Ok = true,
        Result = result
    };

    public static IpcResponse Fail(string id, string code, string message) => new()
    {
        Id = id,
        Ok = false,
        Error = new IpcError { Code = code, Message = message }
    };
}

public sealed class SimSnapshotDto
{
    [JsonPropertyName("onGround")]
    public bool OnGround { get; set; }

    [JsonPropertyName("enginesRunning")]
    public bool EnginesRunning { get; set; }

    [JsonPropertyName("parkingBrake")]
    public bool ParkingBrake { get; set; }

    [JsonPropertyName("paused")]
    public bool Paused { get; set; }

    [JsonPropertyName("slewActive")]
    public bool SlewActive { get; set; }

    [JsonPropertyName("simRate")]
    public double SimRate { get; set; } = 1;

    [JsonPropertyName("cgPercent")]
    public double? CgPercent { get; set; }

    [JsonPropertyName("grossWeightLb")]
    public double? GrossWeightLb { get; set; }

    [JsonPropertyName("fuelTotal")]
    public double? FuelTotal { get; set; }

    [JsonPropertyName("payloadTotal")]
    public double? PayloadTotal { get; set; }

    [JsonPropertyName("vars")]
    public Dictionary<string, double> Vars { get; set; } = new();
}

public sealed class AircraftIdentityDto
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("atcModel")]
    public string? AtcModel { get; set; }

    [JsonPropertyName("atcType")]
    public string? AtcType { get; set; }

    /// <summary>Tail/callsign from ATC ID (not ICAO type).</summary>
    [JsonPropertyName("atcId")]
    public string? AtcId { get; set; }

    /// <summary>Best-effort ICAO type code derived from ATC MODEL / title.</summary>
    [JsonPropertyName("icao")]
    public string? Icao { get; set; }

    [JsonPropertyName("airline")]
    public string? Airline { get; set; }
}

/// <summary>MSFS scenery airport from SimConnect Facilities (lat/lon of installed field).</summary>
public sealed class AirportFacilityDto
{
    [JsonPropertyName("icao")]
    public string Icao { get; set; } = "";

    [JsonPropertyName("region")]
    public string? Region { get; set; }

    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("lat")]
    public double Lat { get; set; }

    [JsonPropertyName("lon")]
    public double Lon { get; set; }

    [JsonPropertyName("altMeters")]
    public double? AltMeters { get; set; }

    [JsonPropertyName("runways")]
    public List<AirportRunwayDto> Runways { get; set; } = new();
}

/// <summary>One runway strip from SimConnect Facilities (maps to CareerRunway).</summary>
public sealed class AirportRunwayDto
{
    [JsonPropertyName("ident")]
    public string Ident { get; set; } = "";

    [JsonPropertyName("identReciprocal")]
    public string? IdentReciprocal { get; set; }

    [JsonPropertyName("headingTrueDeg")]
    public double HeadingTrueDeg { get; set; }

    [JsonPropertyName("lengthM")]
    public double LengthM { get; set; }

    [JsonPropertyName("widthM")]
    public double WidthM { get; set; }

    [JsonPropertyName("lat")]
    public double Lat { get; set; }

    [JsonPropertyName("lon")]
    public double Lon { get; set; }

    [JsonPropertyName("surface")]
    public string? Surface { get; set; }
}
