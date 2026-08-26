namespace SimBridgeHost.Sim.Pmdg;

/// <summary>
/// PMDG 777 (77X) CDU event IDs from PMDG_777X_SDK.h (absolute SimConnect #ids).
/// FO CDU = captain offsets + <see cref="RightCduOffset"/> (73).
/// </summary>
public static class Pmdg777Cdu
{
    /// <summary>SDK: EVT_CDU_R_* = EVT_CDU_L_* + 73.</summary>
    public const uint RightCduOffset = 73;

    public const uint MouseLeftSingle = 0x20000000;
    public const uint MouseLeftRelease = 0x00020000;

    public const uint EvtCduL_L1 = 69960;
    public const uint EvtCduL_L2 = 69961;
    public const uint EvtCduL_L3 = 69962;
    public const uint EvtCduL_L4 = 69963;
    public const uint EvtCduL_L5 = 69964;
    public const uint EvtCduL_L6 = 69965;
    public const uint EvtCduL_R1 = 69966;
    public const uint EvtCduL_R2 = 69967;
    public const uint EvtCduL_R3 = 69968;
    public const uint EvtCduL_R4 = 69969;
    public const uint EvtCduL_R5 = 69970;
    public const uint EvtCduL_R6 = 69971;

    public const uint EvtCduL_InitRef = 69972;
    public const uint EvtCduL_Menu = 69982;
    public const uint EvtCduL_Exec = 69981;
    public const uint EvtCduL_PrevPage = 69984;
    public const uint EvtCduL_NextPage = 69985;

    public const uint EvtCduL_1 = 69986;
    public const uint EvtCduL_2 = 69987;
    public const uint EvtCduL_3 = 69988;
    public const uint EvtCduL_4 = 69989;
    public const uint EvtCduL_5 = 69990;
    public const uint EvtCduL_6 = 69991;
    public const uint EvtCduL_7 = 69992;
    public const uint EvtCduL_8 = 69993;
    public const uint EvtCduL_9 = 69994;
    public const uint EvtCduL_Dot = 69995;
    public const uint EvtCduL_0 = 69996;
    public const uint EvtCduL_PlusMinus = 69997;
    public const uint EvtCduL_Del = 70025;
    public const uint EvtCduL_Slash = 70026;
    public const uint EvtCduL_Clr = 70027;

    private static readonly Dictionary<string, uint> KeysLeft = new(StringComparer.OrdinalIgnoreCase)
    {
        ["INIT_REF"] = EvtCduL_InitRef,
        ["INIT"] = EvtCduL_InitRef,
        ["MENU"] = EvtCduL_Menu,
        ["EXEC"] = EvtCduL_Exec,
        ["PREV"] = EvtCduL_PrevPage,
        ["NEXT"] = EvtCduL_NextPage,
        ["CLR"] = EvtCduL_Clr,
        ["DEL"] = EvtCduL_Del,
        ["DOT"] = EvtCduL_Dot,
        ["."] = EvtCduL_Dot,
        ["/"] = EvtCduL_Slash,
        ["SLASH"] = EvtCduL_Slash,
        ["+/-"] = EvtCduL_PlusMinus,
        ["PLUS_MINUS"] = EvtCduL_PlusMinus,
        ["L1"] = EvtCduL_L1,
        ["L2"] = EvtCduL_L2,
        ["L3"] = EvtCduL_L3,
        ["L4"] = EvtCduL_L4,
        ["L5"] = EvtCduL_L5,
        ["L6"] = EvtCduL_L6,
        ["R1"] = EvtCduL_R1,
        ["R2"] = EvtCduL_R2,
        ["R3"] = EvtCduL_R3,
        ["R4"] = EvtCduL_R4,
        ["R5"] = EvtCduL_R5,
        ["R6"] = EvtCduL_R6,
        ["0"] = EvtCduL_0,
        ["1"] = EvtCduL_1,
        ["2"] = EvtCduL_2,
        ["3"] = EvtCduL_3,
        ["4"] = EvtCduL_4,
        ["5"] = EvtCduL_5,
        ["6"] = EvtCduL_6,
        ["7"] = EvtCduL_7,
        ["8"] = EvtCduL_8,
        ["9"] = EvtCduL_9,
    };

    public static bool TryResolveKey(string key, bool rightCdu, out uint eventId)
    {
        eventId = 0;
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        if (!KeysLeft.TryGetValue(key.Trim(), out var leftId))
        {
            return false;
        }

        eventId = rightCdu ? leftId + RightCduOffset : leftId;
        return true;
    }
}
