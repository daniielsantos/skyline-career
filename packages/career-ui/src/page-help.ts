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
      'Open SimBrief, accept the OFP, and Airframe sets Fuel and Payload Due from that plan — not from the klb on the contract tile.',
      'Load the aircraft in the addon EFB (or Inject when the airframe allows). Preflight is green when Sim matches Due.',
      'Keep the aircraft EFB in LB (not kg) for Import / Apply — metric mode often mismatches Airframe Loaded vs Due.',
      'Cabin jets (Maddog, Fenix, JF): LOAD OFP / Import can overfill holds. Trim cargo to MZFW, Instant Load, then balance CG yourself.',
    ],
  },
  freights: {
    id: 'freights',
    title: 'How Freights works',
    kicker: 'Page guide',
    bullets: [
      'Cargo board. Pick Yours or VA in the aircraft list — VA tails pay Jet-A from the VA and send your cut % home.',
      'Pick a lot (or several on the same route), then Dispatch to build the flight.',
      'Urgent and idle chips are economy pressure — same commodity, different pay and clock.',
      'A lock means Hangar → Cargo Ops has not unlocked that commodity yet (your home ladder).',
      'Passenger work is under Charter in the sidebar — separate from cargo freights.',
    ],
  },
  charter: {
    id: 'charter',
    title: 'How Charter works',
    kicker: 'Page guide',
    bullets: [
      'Passenger offers from terminal pools — not Market cargo freights.',
      'Fit gates seats, range, and passenger config on your parked airframe.',
      'Prepare opens a fixed passenger manifest (no split/combine like cargo).',
      'TTL is delivery pressure: accept late relative to the clock and settle can cut pay.',
    ],
  },
  ports: {
    id: 'ports',
    title: 'How Ports works',
    kicker: 'Page guide',
    bullets: [
      'This sidebar Ports is your personal company — warehouses, Demand, and Port FBO you claim solo. Company (VA) desk is under My VA → Ports.',
      'Seaport listings sell at factory price into a warehouse at a pickup hub. Overflow sits in the yard — listings do not spawn just because you opened this page.',
      'The yard restocks on a daily inbound discharge. Concession lease grows yard cap; renew cost follows recent throughput.',
      'Buy warehouse space (T1–T3), then Store yard lots into it. Fees apply when you move cargo into the warehouse.',
      'Demand Board is the sell tab: terminals pay when stock is low. Hold pledges warehouse kg; Fly now or Dispatch stages the flight.',
      'On Warehouse, pick a hub. Move sends company stock to another warehouse (no payout). Overflow lands in the dest hub yard, not the terminal.',
    ],
  },
  va: {
    id: 'va',
    title: 'How My VA works',
    kicker: 'Page guide',
    bullets: [
      'My VA is the crew desk for one company — yours when published, or the airline you joined. It is not a second company.',
      'Fresh VA = shared fleet + pilot cut on Freights. Port FBO is a later company CAPEX (WH T3 → claim) — see Path to Port FBO on Hauls / Ports.',
      'Hauls = Open desk holds: pick a VA tail, Accept if it fits at origin, or Prepare (ferry / partial load). Ports (this page) = company desk: claim FBO, buy WH, Scout, Demand. Sidebar Ports stays your personal company.',
      'Topbar Wallet = your home company. Ledger here = shared company cash when you fly that desk. Money map shows who pays Jet-A, cut, ferry, and MX.',
      'Hangar here is that company fleet; sidebar Hangar stays home. Members ferry/reserve; owner does MX/OH/sell.',
      'Freights with a VA-labeled aircraft: cut % of route net → your home Wallet; rest stays on the listed company.',
    ],
  },
  vaDirectory: {
    id: 'va-directory',
    title: 'How VAs directory works',
    kicker: 'Page guide',
    bullets: [
      'Lists only companies that published — not every company in the world.',
      'Joining keeps your personal company, wallet, and fleet. Early value is VA aircraft + cut; Port FBO desk/Hauls come after the company builds WH T3 and claims a port.',
      'Quality chip is settle flight score + on-time over ~7 days (needs a few flights).',
      'Request to join when hiring is open, or use a private invite code anytime.',
      'Owners publish from Company; manage seats under My VA (same company, crew desk).',
    ],
  },
  vaRanking: {
    id: 'va-ranking',
    title: 'How Ranking works',
    kicker: 'Page guide',
    bullets: [
      'Seven-day Internal Haul stats across VAs — distance and haul count.',
      'Flight quality rides along when the VA has enough scored settles.',
      'Pilot strip shows members of your active company when you have one.',
      'Settle hauls from Dispatch after flying WH→WH bridges from Ports.',
    ],
  },
  hangar: {
    id: 'hangar',
    title: 'How Hangar works',
    kicker: 'Page guide',
    bullets: [
      'Aircraft must be at the mission origin with you. Travel moves the pilot; ferry moves the airframe (often empty).',
      'Inspect, then repair. Hours raise MX cost and cut resale. Parked frames pay daily parking (assigned and leased-out do not).',
      'Pax shows Charter seats. “dual” / “needs pax” means cargo glass + passenger glass on the same SKU — not the Cargo kg payload line.',
      'Cargo Ops (sub-tab here) unlocks Market commodities and freighter classes. Dry/Light starters are open; Medium and Jet climb the ladder.',
      'Company home (Base) unlocks parking and Jet-A/MRO perks. Cashflow is the ledger — freights, fuel, leases, shop, parking.',
    ],
  },
  airframes: {
    id: 'airframes',
    title: 'How Airframes works',
    kicker: 'Page guide',
    bullets: [
      'New, used, and lease prices are Airframe economy numbers — not real-world MSRP.',
      'Buy or lease into the Hangar. One Market card is a glass family (variants share the SKU).',
      'Pax = Charter seats. “dual” = cargo glass + passenger glass on this SKU (not Cargo kg). Fit needs the passenger config.',
      'Condition and hours on used frames change what you pay and what MX will cost later.',
    ],
  },
  company: {
    id: 'company',
    title: 'How Company works',
    kicker: 'Page guide',
    bullets: [
      'This is your airline — home hub, name, wallet snapshot. Publishing puts the same company in the VAs directory; it does not create a second company.',
      'Open for pilots / In the directory controls the public listing. My VA is the crew desk (roster, ledger, hangar) for that listing.',
      'You need a Base and cash to grow; the Hangar cashflow tab is the detailed ledger.',
    ],
  },
  network: {
    id: 'network',
    title: 'How Network works',
    kicker: 'Page guide',
    bullets: [
      'Map of Airframe hubs. Open an airport to see that terminal’s stock, contracts, and fuel.',
      'Bush and trip-only fields are on the map even when they do not form Market lots.',
    ],
  },
  rivals: {
    id: 'rivals',
    title: 'How Rivals works',
    kicker: 'Page guide',
    bullets: [
      'Dev Mode only — NPC operators bid the same lots, fly, shop MX, and rest. You do not dispatch them.',
      'Thin fleet or busy lanes show up as Market pressure — they are why some lots pay more or fill faster.',
    ],
  },
  logbook: {
    id: 'logbook',
    title: 'How Logbook works',
    kicker: 'Page guide',
    bullets: [
      'Settled flights — aircraft, cargo, distance, payout. It does not change the live board.',
      'VA tag marks flights flown for a listed Virtual Airline (VA aircraft / Internal Haul).',
      'Pay is what your home wallet received: solo/owner = full route; member Freights show your cut (not VA gross).',
    ],
  },
  settings: {
    id: 'settings',
    title: 'How Settings works',
    kicker: 'Page guide',
    bullets: [
      'SimBrief username, pounds vs kilos, Sound (voice / chime for preflight + settle), and local career prefs. This is not the aircraft EFB.',
      'Weight units change how Airframe displays Due — the sim and OFP still use the aircraft’s native units.',
    ],
  },
  airport: {
    id: 'airport',
    title: 'How this terminal works',
    kicker: 'Page guide',
    bullets: [
      'Stock, contracts, and fuel for this ICAO. Hub level rises with traffic through here (capacity and flow scale).',
      'Contracts are lots tied to this field. Base, if built, is crew and parking at this hub.',
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
    case 'va':
      return PAGE_HELP.va;
    case 'vaDirectory':
      return PAGE_HELP.vaDirectory;
    case 'vaRanking':
      return PAGE_HELP.vaRanking;
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
      return PAGE_HELP.freights;
    case 'charter':
      return PAGE_HELP.charter;
    default:
      return PAGE_HELP.freights;
  }
}
