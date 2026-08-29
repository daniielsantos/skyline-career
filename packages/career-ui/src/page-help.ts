export type PageHelpCopy = {
  id: string;
  title: string;
  kicker: string;
  bullets: string[];
};

export const PAGE_HELP = {
  dispatch: {
    id: 'dispatch',
    title: 'How Dispatch works',
    kicker: 'Page guide',
    bullets: [
      'Freights (or a contract) become a flight here. Edit cargo if you need to change lots — then generate a new OFP.',
      'Open SimBrief, accept the OFP, and Skyline sets Fuel and Payload Due from that plan — not from the klb on the contract tile.',
      'Load the aircraft in the addon EFB (or Inject when the airframe allows). Preflight is green when Sim matches Due.',
      'Keep the aircraft EFB in LB (not kg) for Import / Apply — metric mode often mismatches Skyline Loaded vs Due.',
      'Cabin jets (Maddog, Fenix, JF): LOAD OFP / Import can overfill holds. Trim cargo to MZFW, Instant Load, then balance CG yourself.',
    ],
  },
  freights: {
    id: 'freights',
    title: 'How Freights works',
    kicker: 'Page guide',
    bullets: [
      'This is the local cargo board. Pick a lot (or several on the same route), then Dispatch to build the flight.',
      'Urgent and idle chips are economy pressure — same commodity, different pay and clock.',
      'A lock means Hangar → Cargo Ops has not unlocked that commodity yet.',
      'Bush trips, when listed, are separate arcs — not Market freights.',
    ],
  },
  ports: {
    id: 'ports',
    title: 'How Ports works',
    kicker: 'Page guide',
    bullets: [
      'Seaport listings sell at factory price into a warehouse at a pickup hub. Overflow sits in the yard — listings do not spawn just because you opened this page.',
      'The yard restocks on a daily inbound discharge. Concession lease grows yard cap; renew cost follows recent throughput.',
      'Buy warehouse space (T1–T3), then Store yard lots into it. Fees apply when you move cargo into the warehouse.',
      'Demand Board is the sell tab: terminals pay when stock is low. Hold pledges warehouse kg; Fly now or Dispatch stages the flight.',
      'On Warehouse, pick a hub. Move sends company stock to another warehouse (no payout). Overflow lands in the dest hub yard, not the terminal.',
    ],
  },
  hangar: {
    id: 'hangar',
    title: 'How Hangar works',
    kicker: 'Page guide',
    bullets: [
      'Aircraft must be at the mission origin with you. Travel moves the pilot; ferry moves the airframe (often empty).',
      'Inspect, then repair. Hours raise MX cost and cut resale. Parked frames pay daily parking (assigned and leased-out do not).',
      'Cargo Ops (sub-tab here) unlocks Market commodities and freighter classes. Dry/Light starters are open; Medium and Jet climb the ladder.',
      'Crew lives at your FBO. Cashflow is the ledger — freights, fuel, leases, shop, parking.',
    ],
  },
  airframes: {
    id: 'airframes',
    title: 'How Airframes works',
    kicker: 'Page guide',
    bullets: [
      'New, used, and lease prices are Skyline economy numbers — not real-world MSRP.',
      'Buy or lease into the Hangar. One Market card is a glass family (variants share the SKU).',
      'Condition and hours on used frames change what you pay and what MX will cost later.',
    ],
  },
  company: {
    id: 'company',
    title: 'How Company works',
    kicker: 'Page guide',
    bullets: [
      'Home hub, name, and company snapshot live here. Progression follows traffic, fleet, and Cargo Ops — not a separate XP bar on this page.',
      'You need an FBO and cash to grow; the Hangar cashflow tab is the detailed ledger.',
    ],
  },
  network: {
    id: 'network',
    title: 'How Network works',
    kicker: 'Page guide',
    bullets: [
      'Map of Skyline hubs. Open an airport to see that terminal’s stock, contracts, and fuel.',
      'Bush and trip-only fields are on the map even when they do not form Market lots.',
    ],
  },
  rivals: {
    id: 'rivals',
    title: 'How Rivals works',
    kicker: 'Page guide',
    bullets: [
      'NPC operators bid the same lots, fly, shop MX, and rest. You do not dispatch them.',
      'Thin fleet or busy lanes show up as Market pressure — they are why some lots pay more or fill faster.',
    ],
  },
  logbook: {
    id: 'logbook',
    title: 'How Logbook works',
    kicker: 'Page guide',
    bullets: [
      'Settled flights only — aircraft, cargo, distance, payout. It does not change the live board.',
    ],
  },
  settings: {
    id: 'settings',
    title: 'How Settings works',
    kicker: 'Page guide',
    bullets: [
      'SimBrief username, pounds vs kilos, and local career prefs. This is not the aircraft EFB.',
      'Weight units change how Skyline displays Due — the sim and OFP still use the aircraft’s native units.',
    ],
  },
  airport: {
    id: 'airport',
    title: 'How this terminal works',
    kicker: 'Page guide',
    bullets: [
      'Stock, contracts, and fuel for this ICAO. Hub level rises with traffic through here (capacity and flow scale).',
      'Contracts are lots tied to this field. FBO, if built, is crew and parking at this hub.',
      'Fuel trucks restock Jet-A in the background — a dry tank here is a logistics problem, not a missing OFP.',
    ],
  },
} as const satisfies Record<string, PageHelpCopy>;

export type PageHelpId = keyof typeof PAGE_HELP;

export function resolvePageHelp(opts: {
  showAirport: boolean;
  showStaging: boolean;
  tab: string;
}): PageHelpCopy | null {
  if (opts.showAirport) return PAGE_HELP.airport;
  if (opts.showStaging || opts.tab === 'staging') return PAGE_HELP.dispatch;
  switch (opts.tab) {
    case 'ports':
      return PAGE_HELP.ports;
    case 'aircraft':
      return PAGE_HELP.airframes;
    case 'hangar':
      return PAGE_HELP.hangar;
    case 'pilot':
      return PAGE_HELP.company;
    case 'map':
      return PAGE_HELP.network;
    case 'fleet':
      return PAGE_HELP.rivals;
    case 'missions':
      return PAGE_HELP.logbook;
    case 'settings':
      return PAGE_HELP.settings;
    case 'market':
    default:
      return PAGE_HELP.freights;
  }
}
