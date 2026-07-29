namespace SimBridgeHost.Sim.Pmdg;

using System.Runtime.InteropServices;
using System.Text.Json.Serialization;

/// <summary>
/// PMDG NG3 Client Data helpers. Receive path uses a blittable 916-byte raw window
/// (managed RegisterStruct does not reliably fill non-blittable structs with bool[]).
/// </summary>
public static class PmdgNg3ClientData
{
    public const string DataAreaName = PMDGNG3Constants.PMDG_NG3_DATA_NAME;

    /// <summary>Local map id (blind-assist style). Name binding is what matters.</summary>
    public const uint ClientDataId = 0x4E473730;

    public const uint DataDefinitionId = 0x4E473734;

    public const string ControlAreaName = PMDGNG3Constants.PMDG_NG3_CONTROL_NAME;

    /// <summary>
    /// Local map ids for Control — chosen not to collide with Data (0x4E473730 / 0x4E473734)
    /// or official SDK Control constants (0x4E473333 / 0x4E473334).
    /// </summary>
    public const uint ControlClientDataId = 0x4E473731;

    public const uint ControlDefinitionId = 0x4E473735;

    public static uint DataSize => (uint)Marshal.SizeOf<PMDGNG3DataStruct>();

    public static uint ControlSize => (uint)Marshal.SizeOf<PMDGNG3Control>();

    public static int OffsetQtyCenter =>
        Marshal.OffsetOf<PMDGNG3DataStruct>(nameof(PMDGNG3DataStruct.FUEL_QtyCenter)).ToInt32();

    public static int OffsetQtyLeft =>
        Marshal.OffsetOf<PMDGNG3DataStruct>(nameof(PMDGNG3DataStruct.FUEL_QtyLeft)).ToInt32();

    public static int OffsetQtyRight =>
        Marshal.OffsetOf<PMDGNG3DataStruct>(nameof(PMDGNG3DataStruct.FUEL_QtyRight)).ToInt32();

    public static int OffsetWeightInKg =>
        Marshal.OffsetOf<PMDGNG3DataStruct>(nameof(PMDGNG3DataStruct.WeightInKg)).ToInt32();

    /// <summary>Blittable receive buffer — memcpy-friendly for managed SimConnect.</summary>
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public unsafe struct RawBlob
    {
        public fixed byte Data[916];
    }

    public static unsafe byte[] ToBytes(in RawBlob blob)
    {
        var bytes = new byte[916];
        fixed (byte* src = blob.Data)
        fixed (byte* dst = bytes)
        {
            Buffer.MemoryCopy(src, dst, 916, 916);
        }

        return bytes;
    }

    public static bool TryReadFloat(byte[] bytes, int offset, out float value)
    {
        value = 0;
        if (bytes is null || offset < 0 || offset + 4 > bytes.Length)
        {
            return false;
        }

        value = BitConverter.ToSingle(bytes, offset);
        return !float.IsNaN(value) && !float.IsInfinity(value);
    }

    public static int CountNonZero(byte[] bytes)
    {
        var n = 0;
        foreach (var b in bytes)
        {
            if (b != 0)
            {
                n++;
            }
        }

        return n;
    }

    public static int FindFuelOffset(
        byte[] bytes,
        double expectCenterLb,
        double expectLeftLb,
        double expectRightLb,
        out float center,
        out float left,
        out float right)
    {
        center = left = right = 0;
        if (bytes is null || bytes.Length < 12)
        {
            return -1;
        }

        var best = -1;
        var bestScore = double.MaxValue;
        for (var offset = 0; offset + 12 <= bytes.Length; offset += 4)
        {
            var c = BitConverter.ToSingle(bytes, offset);
            var l = BitConverter.ToSingle(bytes, offset + 4);
            var r = BitConverter.ToSingle(bytes, offset + 8);
            if (c < 0 || l < 0 || r < 0 || c > 80_000 || l > 80_000 || r > 80_000)
            {
                continue;
            }

            if (float.IsNaN(c) || float.IsNaN(l) || float.IsNaN(r))
            {
                continue;
            }

            var score = Rel(c, expectCenterLb) + Rel(l, expectLeftLb) + Rel(r, expectRightLb);
            if (score < bestScore && score < 0.15)
            {
                bestScore = score;
                best = offset;
                center = c;
                left = l;
                right = r;
            }
        }

        return best;
    }

    private static double Rel(double actual, double expect)
    {
        var scale = Math.Max(Math.Abs(expect), 25.0);
        return Math.Abs(actual - expect) / scale;
    }
}

public sealed class PmdgNg3FuelDto
{
    [JsonPropertyName("available")]
    public bool Available { get; set; }

    [JsonPropertyName("leftLb")]
    public double? LeftLb { get; set; }

    [JsonPropertyName("rightLb")]
    public double? RightLb { get; set; }

    [JsonPropertyName("centerLb")]
    public double? CenterLb { get; set; }

    [JsonPropertyName("weightInKg")]
    public bool? WeightInKg { get; set; }

    [JsonPropertyName("ageMs")]
    public long? AgeMs { get; set; }

    [JsonPropertyName("layoutOffset")]
    public int? LayoutOffset { get; set; }

    [JsonPropertyName("layoutOk")]
    public bool LayoutOk { get; set; }

    [JsonPropertyName("nonzeroBytes")]
    public int? NonzeroBytes { get; set; }
}
