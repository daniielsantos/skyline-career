namespace SimBridgeHost.Sim.Pmdg;

/// <summary>
/// PMDG NG3 CDU / Control helpers. Fuel qty has no direct set event — load is a CDU keystream.
/// Event IDs = THIRD_PARTY_EVENT_ID_MIN (0x11000) + offset from PMDG_NG3_SDK.h.
/// </summary>
public static class PmdgNg3Cdu
{
    public const uint ThirdPartyEventIdMin = 0x00011000; // 69632

    public const uint MouseLeftSingle = 0x20000000;
    public const uint MouseLeftRelease = 0x00020000;

    // Capt (left) CDU — offsets from SDK
    public const uint EvtCduL_L1 = ThirdPartyEventIdMin + 534;
    public const uint EvtCduL_L2 = ThirdPartyEventIdMin + 535;
    public const uint EvtCduL_L3 = ThirdPartyEventIdMin + 536;
    public const uint EvtCduL_L4 = ThirdPartyEventIdMin + 537;
    public const uint EvtCduL_L5 = ThirdPartyEventIdMin + 538;
    public const uint EvtCduL_L6 = ThirdPartyEventIdMin + 539;
    public const uint EvtCduL_R1 = ThirdPartyEventIdMin + 540;
    public const uint EvtCduL_R2 = ThirdPartyEventIdMin + 541;
    public const uint EvtCduL_R3 = ThirdPartyEventIdMin + 542;
    public const uint EvtCduL_R4 = ThirdPartyEventIdMin + 543;
    public const uint EvtCduL_R5 = ThirdPartyEventIdMin + 544;
    public const uint EvtCduL_R6 = ThirdPartyEventIdMin + 545;

    public const uint EvtCduL_InitRef = ThirdPartyEventIdMin + 546;
    public const uint EvtCduL_Menu = ThirdPartyEventIdMin + 551;
    public const uint EvtCduL_Exec = ThirdPartyEventIdMin + 556;
    public const uint EvtCduL_PrevPage = ThirdPartyEventIdMin + 559;
    public const uint EvtCduL_NextPage = ThirdPartyEventIdMin + 560;

    public const uint EvtCduL_1 = ThirdPartyEventIdMin + 561;
    public const uint EvtCduL_2 = ThirdPartyEventIdMin + 562;
    public const uint EvtCduL_3 = ThirdPartyEventIdMin + 563;
    public const uint EvtCduL_4 = ThirdPartyEventIdMin + 564;
    public const uint EvtCduL_5 = ThirdPartyEventIdMin + 565;
    public const uint EvtCduL_6 = ThirdPartyEventIdMin + 566;
    public const uint EvtCduL_7 = ThirdPartyEventIdMin + 567;
    public const uint EvtCduL_8 = ThirdPartyEventIdMin + 568;
    public const uint EvtCduL_9 = ThirdPartyEventIdMin + 569;
    public const uint EvtCduL_Dot = ThirdPartyEventIdMin + 570;
    public const uint EvtCduL_0 = ThirdPartyEventIdMin + 571;
    public const uint EvtCduL_PlusMinus = ThirdPartyEventIdMin + 572;
    public const uint EvtCduL_Del = ThirdPartyEventIdMin + 600;
    public const uint EvtCduL_Slash = ThirdPartyEventIdMin + 601;
    public const uint EvtCduL_Clr = ThirdPartyEventIdMin + 602;

    private static readonly Dictionary<string, uint> Keys = new(StringComparer.OrdinalIgnoreCase)
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

    public static bool TryResolveKey(string key, out uint eventId)
    {
        eventId = 0;
        if (string.IsNullOrWhiteSpace(key))
        {
            return false;
        }

        return Keys.TryGetValue(key.Trim(), out eventId);
    }

    public static IEnumerable<uint> DigitEvents(string text)
    {
        foreach (var ch in text)
        {
            if (ch is >= '0' and <= '9')
            {
                yield return Keys[ch.ToString()];
            }
            else if (ch is '.' or ',')
            {
                yield return EvtCduL_Dot;
            }
            else if (ch == '/')
            {
                yield return EvtCduL_Slash;
            }
            else if (!char.IsWhiteSpace(ch))
            {
                throw new ArgumentException($"Unsupported CDU char: '{ch}'");
            }
        }
    }
}
