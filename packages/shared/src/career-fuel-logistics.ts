/**
 * Background Jet-A road logistics: small tanker fleet redistributes fuel from
 * fuel hubs to shortage spokes. Not a player trucking career.
 */

import {
  hoursToMs,
  MS_PER_HOUR,
  MS_PER_TICK,
  msToHours,
} from './career-clock.js';
import { FUEL_HUB_ICAOS, routeDistanceNm } from './career-economy.js';
import { recordFuelTruckDeliveryActivity } from './career-hub-level.js';
import type {
  AirportTerminal,
  CareerEconomyWorld,
  FuelHaul,
  FuelHaulView,
  FuelTruck,
  FuelTruckClassId,
} from './types/career-economy.js';

export const FUEL_TRUCK_FLEET_SIZE = 585;

export const FUEL_TRUCK_COMPOSITION: ReadonlyArray<{
  truckClassId: FuelTruckClassId;
  count: number;
}> = [
  { truckClassId: 'rigid_tanker', count: 164 },
  { truckClassId: 'semi_tanker', count: 259 },
  { truckClassId: 'btrain_tanker', count: 162 },
] as const;

/** Usable Jet-A payload per truck class (kg). Hard cap 32 t. */
export const FUEL_TRUCK_CAPACITY_KG: Record<FuelTruckClassId, number> = {
  rigid_tanker: 12_000,
  semi_tanker: 24_000,
  btrain_tanker: 32_000,
};

export const FUEL_TRUCK_LABEL: Record<FuelTruckClassId, string> = {
  rigid_tanker: 'Rigid tanker',
  semi_tanker: 'Semi tanker',
  btrain_tanker: 'B-train tanker',
};

/** Road distance ≈ air great-circle × this factor. */
const ROAD_DISTANCE_FACTOR = 1.35;
/** Effective average speed including stops (km/h). */
const ROAD_SPEED_KMH = 55;
/** Fixed load + unload hours per haul. */
const LOAD_UNLOAD_HOURS = 2;
/** Min cargo to bother dispatching (kg). */
const MIN_HAUL_KG = 4_000;
/** Dest fill below this is a dispatch candidate. */
const DEST_SHORTAGE_FILL = 0.28;
/** Hub must stay above this fill after dispatch (reserve). */
const HUB_RESERVE_FILL = 0.25;
/** Hub must start above this fill to dispatch. */
const HUB_SURPLUS_FILL = 0.4;
/** Single delivery aims toward this dest fill, not a full tank. */
const DEST_TARGET_FILL = 0.55;
/** Max concurrent enroute hauls into one airport. */
const MAX_INBOUND_HAULS = 2;
const TURNAROUND_MIN_H = 3;
const TURNAROUND_MAX_H = 5;
/** Keep completed hauls briefly for Terminal “last delivery”. */
const COMPLETED_HAUL_RETENTION_MS = 12 * MS_PER_HOUR;
/** Last economy batch of the haul counts as "arriving". */
const ARRIVING_WINDOW_MS = MS_PER_TICK;

const REGION_NEIGHBORS: Record<string, readonly string[]> = {
  'BR-N': ['BR-NE', 'BR-CO'],
  'BR-NE': ['BR-N', 'BR-SE', 'BR-CO'],
  'BR-CO': ['BR-N', 'BR-NE', 'BR-SE', 'BR-S'],
  'BR-SE': ['BR-NE', 'BR-CO', 'BR-S'],
  'BR-S': ['BR-SE', 'BR-CO'],
  // US continental road-neighbor graph (no BR↔US road hauls preferred).
  'US-NE': ['US-SE', 'US-MW'],
  'US-SE': ['US-NE', 'US-MW', 'US-SC', 'US-PR', 'US-VI'],
  'US-PR': ['US-SE', 'US-VI'],
  'US-VI': ['US-SE', 'US-PR'],
  'US-MW': ['US-NE', 'US-SE', 'US-SC', 'US-MT'],
  'US-SC': ['US-SE', 'US-MW', 'US-MT', 'US-W'],
  'US-MT': ['US-MW', 'US-SC', 'US-W'],
  'US-W': ['US-MT', 'US-SC'],
  // Canada domestic only (no US/MX road hauls).
  'CA-W': ['CA-PR'],
  'CA-PR': ['CA-W', 'CA-ON'],
  'CA-ON': ['CA-PR', 'CA-QC'],
  'CA-QC': ['CA-ON', 'CA-AT'],
  'CA-AT': ['CA-QC'],
  // Mexico domestic only (no US road hauls).
  'MX-N': ['MX-C'],
  'MX-C': ['MX-N', 'MX-S', 'MX-Y'],
  'MX-S': ['MX-C', 'MX-Y'],
  'MX-Y': ['MX-C', 'MX-S'],
  // Argentina domestic
  'AR-BA': ['AR-CO', 'AR-NO', 'AR-PA'],
  'AR-CO': ['AR-BA', 'AR-NO', 'AR-PA'],
  'AR-NO': ['AR-BA', 'AR-CO'],
  'AR-PA': ['AR-BA', 'AR-CO'],
  // Chile domestic
  'CL-C': ['CL-S'],
  'CL-S': ['CL-C'],
  // Multi-region SA (single-region UY/PY/GY/SR/GF need no road graph)
  'PE-C': ['PE-S'],
  'PE-S': ['PE-C'],
  'BO-W': ['BO-E'],
  'BO-E': ['BO-W'],
  'EC-C': ['EC-S'],
  'EC-S': ['EC-C'],
  'CO-C': ['CO-N', 'CO-W'],
  'CO-N': ['CO-C'],
  'CO-W': ['CO-C'],
  'VE-C': ['VE-W'],
  'VE-W': ['VE-C'],
  // EU-1 Western core domestic road graphs
  'PT-N': ['PT-C'],
  'PT-C': ['PT-N', 'PT-S'],
  'PT-S': ['PT-C'],
  'ES-N': ['ES-C'],
  'ES-C': ['ES-N', 'ES-S', 'ES-E'],
  'ES-S': ['ES-C', 'ES-E'],
  'ES-E': ['ES-C', 'ES-S'],
  'FR-N': ['FR-C', 'FR-E'],
  'FR-C': ['FR-N', 'FR-S', 'FR-E'],
  'FR-S': ['FR-C', 'FR-E'],
  'FR-E': ['FR-N', 'FR-C', 'FR-S'],
  'GB-S': ['GB-M'],
  'GB-M': ['GB-S', 'GB-N'],
  'GB-N': ['GB-M'],
  'DE-N': ['DE-W', 'DE-E'],
  'DE-W': ['DE-N', 'DE-S', 'DE-E'],
  'DE-S': ['DE-W', 'DE-E'],
  'DE-E': ['DE-N', 'DE-W', 'DE-S'],
  'IT-N': ['IT-C'],
  'IT-C': ['IT-N', 'IT-S'],
  'IT-S': ['IT-C'],
  // EU-2 Nordics + Alps + IE domestic road graphs
  'IE-E': ['IE-W'],
  'IE-W': ['IE-E'],
  'DK-E': ['DK-W'],
  'DK-W': ['DK-E'],
  'NO-S': ['NO-N'],
  'NO-N': ['NO-S'],
  'SE-S': ['SE-N'],
  'SE-N': ['SE-S'],
  'FI-S': ['FI-N'],
  'FI-N': ['FI-S'],
  'AT-E': ['AT-W'],
  'AT-W': ['AT-E'],
  // EU-3 Central-East + Baltics domestic road graphs
  'PL-N': ['PL-C'],
  'PL-C': ['PL-N', 'PL-S'],
  'PL-S': ['PL-C'],
  'CZ-W': ['CZ-E'],
  'CZ-E': ['CZ-W'],
  // EU-4 Balkans domestic road graphs
  'HR-N': ['HR-S'],
  'HR-S': ['HR-N'],
  'RO-W': ['RO-E'],
  'RO-E': ['RO-W'],
  'GR-N': ['GR-S'],
  'GR-S': ['GR-N'],
  // EU-5 Iceland domestic road graph
  'IS-SW': ['IS-NE'],
  'IS-NE': ['IS-SW'],
  // EU-7 East domestic road graphs
  'TR-W': ['TR-C'],
  'TR-C': ['TR-W', 'TR-E'],
  'TR-E': ['TR-C'],
  'UA-W': ['UA-C'],
  'UA-C': ['UA-W', 'UA-E'],
  'UA-E': ['UA-C'],
  // MENA-1 Mediterranean face domestic road graphs
  'MA-N': ['MA-C'],
  'MA-C': ['MA-N', 'MA-S'],
  'MA-S': ['MA-C'],
  'DZ-N': ['DZ-W', 'DZ-E'],
  'DZ-W': ['DZ-N'],
  'DZ-E': ['DZ-N'],
  'TN-N': ['TN-S'],
  'TN-S': ['TN-N'],
  'EG-N': ['EG-S', 'EG-R'],
  'EG-S': ['EG-N'],
  'EG-R': ['EG-N'],
  'IL-C': ['IL-S'],
  'IL-S': ['IL-C'],
  // MENA-2 Gulf domestic road graphs
  'SA-W': ['SA-C'],
  'SA-C': ['SA-W', 'SA-E'],
  'SA-E': ['SA-C'],
  'AE-N': ['AE-C'],
  'AE-C': ['AE-N'],
  'QA-C': [],
  'BH-C': [],
  'KW-C': [],
  'OM-N': ['OM-S'],
  'OM-S': ['OM-N'],
  // MENA-3 North Gulf domestic road graphs
  'IQ-C': ['IQ-S', 'IQ-N'],
  'IQ-S': ['IQ-C'],
  'IQ-N': ['IQ-C'],
  'IR-N': ['IR-C'],
  'IR-C': ['IR-N', 'IR-S'],
  'IR-S': ['IR-C'],
  // MENA-4 Levant-east domestic road graphs
  'JO-C': ['JO-S'],
  'JO-S': ['JO-C'],
  'LB-C': [],
  'SY-S': ['SY-N'],
  'SY-N': ['SY-S'],
  // MENA-5 Maghreb/Nile gap domestic road graphs
  'LY-W': ['LY-E'],
  'LY-E': ['LY-W'],
  'SD-C': ['SD-E'],
  'SD-E': ['SD-C'],
  // MENA-6 Yemen domestic road graph
  'YE-N': ['YE-S'],
  'YE-S': ['YE-N'],
  // Asia-1 Pakistan domestic road graph
  'PK-N': ['PK-S'],
  'PK-S': ['PK-N'],
  // Asia-2 / Asia-3 India domestic road graph
  'IN-N': ['IN-W', 'IN-E'],
  'IN-W': ['IN-N', 'IN-S'],
  'IN-S': ['IN-W', 'IN-E'],
  'IN-E': ['IN-N', 'IN-S'],
  // Asia-4 Sri Lanka domestic road graph
  'LK-W': ['LK-E'],
  'LK-E': ['LK-W'],
  // Asia-5 Central Asia domestic road graphs
  'KZ-S': ['KZ-N'],
  'KZ-N': ['KZ-S'],
  'UZ-E': ['UZ-W'],
  'UZ-W': ['UZ-E'],
  'TM-C': [],
  // Asia-6 Tajikistan / Kyrgyzstan domestic road graphs
  'TJ-S': ['TJ-N'],
  'TJ-N': ['TJ-S'],
  'KG-N': ['KG-S'],
  'KG-S': ['KG-N'],
  // Asia-7 Afghanistan domestic road graph
  'AF-N': ['AF-S'],
  'AF-S': ['AF-N'],
  // Asia-8 Nepal / Bangladesh domestic road graphs
  'NP-C': [],
  'BD-C': ['BD-E'],
  'BD-E': ['BD-C'],
  // Asia-9 Bhutan / Myanmar domestic road graphs
  'BT-C': [],
  'MM-S': ['MM-N'],
  'MM-N': ['MM-S'],
  // Asia-10 Thailand domestic road graph
  'TH-C': ['TH-N', 'TH-S'],
  'TH-N': ['TH-C'],
  'TH-S': ['TH-C'],
  // Asia-11 Vietnam / Malaysia / Singapore domestic road graphs
  'VN-N': ['VN-S'],
  'VN-S': ['VN-N'],
  'MY-C': ['MY-N'],
  'MY-N': ['MY-C'],
  'MY-E': ['MY-K'],
  'MY-K': ['MY-E'],
  'SG-C': [],
  // Asia-12 Indonesia / Philippines — island groups keep local fuel hubs
  'ID-J': [],
  'ID-S': [],
  'ID-B': [],
  'ID-K': [],
  'ID-U': [],
  'PH-L': [],
  'PH-V': [],
  'PH-M': [],
  // Asia-13 China / Japan / Korea domestic road graphs
  'CN-N': ['CN-E', 'CN-W'],
  'CN-E': ['CN-N', 'CN-S'],
  'CN-S': ['CN-E', 'CN-W'],
  'CN-W': ['CN-N', 'CN-S'],
  'JP-E': ['JP-W', 'JP-N'],
  'JP-W': ['JP-E', 'JP-S'],
  'JP-S': ['JP-W'],
  'JP-N': ['JP-E'],
  'KR-C': ['KR-S'],
  'KR-S': ['KR-C'],
  'KR-J': [],
  // Asia-14 Taiwan / Australia / New Zealand domestic road graphs
  'TW-N': ['TW-S'],
  'TW-S': ['TW-N'],
  'AU-E': ['AU-S', 'AU-Q'],
  'AU-S': ['AU-E'],
  'AU-Q': ['AU-E'],
  'AU-W': [],
  'NZ-N': [],
  'NZ-S': [],
  // Asia-15 Pacific hinge (islands — no road to the mainland)
  'US-HI': [],
  'FJ-W': [],
  'PG-S': [],
  'NC-S': [],
};

const TRUCK_NAME_POOL = [
  'BR Distribuidora 1',
  'BR Distribuidora 2',
  'BR Distribuidora 3',
  'Posto Norte Log',
  'Amazônia Fuel Run',
  'Cerrado Tankers',
  'Sul Combustíveis',
  'Litoral Jet-A',
  'Planalto Pipe & Truck',
  'Nordeste Abastece',
  'Pantanal Fuel Co',
  'Serra Tank Line',
  'Gulf Coast Tankers',
  'Midwest Jet Haul',
  'Empire Fuel Line',
  'Sunbelt Abastece',
  'Rockies Tank Run',
  'Pacific Pipe Road',
  'Great Lakes Fuel',
  'Lone Star Tankers',
  'Interior BR Tank',
  'Amazon Spoke Fuel',
  'CO Agro Jet-A',
  'SE Feeders Fuel',
  'NE Sertão Tank',
  'Sul Fronteira Fuel',
  'Gateway Jet Haul',
  'Coastal BR Tankers',
  'Iberia Jet Haul',
  'Lisbon Tank Run',
  'Madrid Fuel Line',
  'Barcelona Pipe Road',
  'Paris CDG Tankers',
  'Lyon Rhone Fuel',
  'Marseille Port Jet',
  'Heathrow Fuel Road',
  'Manchester Tank Line',
  'Frankfurt Main Haul',
  'Munich Bavaria Fuel',
  'Hamburg Harbor Tank',
  'Schiphol Jet Road',
  'Brussels Tank Run',
  'Rome Fiumicino Fuel',
  'Milan Malpensa Haul',
  'Dublin Jet Road',
  'Shannon Tank Run',
  'Copenhagen Fuel Line',
  'Billund Tank Haul',
  'Oslo Gardermoen Fuel',
  'Bergen Fjord Tank',
  'Stockholm Arlanda Haul',
  'Gothenburg Port Fuel',
  'Helsinki Vantaa Tank',
  'Zurich Alpine Fuel',
  'Geneva Jet Road',
  'Vienna Tank Line',
  'Innsbruck Alpine Haul',
  'Warsaw Chopin Fuel',
  'Gdansk Harbor Tank',
  'Krakow Tank Run',
  'Prague Vaclav Fuel',
  'Brno Industrial Haul',
  'Bratislava Tank Line',
  'Budapest Liszt Fuel',
  'Tallinn Jet Road',
  'Riga Port Tank',
  'Vilnius Fuel Line',
  'Zagreb Tank Run',
  'Split Adriatic Fuel',
  'Ljubljana Jet Road',
  'Bucharest Coanda Fuel',
  'Sofia Tank Line',
  'Athens Venizelos Haul',
  'Thessaloniki Fuel Road',
  'Belgrade Tesla Tank',
  'Keflavik Jet Road',
  'Akureyri Tank Line',
  'Sarajevo Tank Run',
  'Podgorica Fuel Road',
  'Tirana Jet Haul',
  'Skopje Tank Line',
  'Istanbul Jet Road',
  'Ankara Tank Haul',
  'Izmir Port Fuel',
  'Kyiv Boryspil Tank',
  'Lviv Fuel Road',
  'Odesa Harbor Tank',
  'Minsk Tank Run',
  'Chisinau Fuel Road',
  'Tbilisi Jet Haul',
  'Yerevan Tank Line',
  'Baku Caspian Fuel',
  'Luxembourg Cargo Tank',
  'Malta Island Fuel',
  'Larnaca Jet Road',
  'Pristina Tank Run',
  'Casablanca Jet Road',
  'Tangier Med Tank',
  'Marrakech Fuel Line',
  'Agadir Tank Run',
  'Algiers Jet Haul',
  'Oran Port Fuel',
  'Tunis Carthage Tank',
  'Monastir Fuel Road',
  'Cairo Jet Haul',
  'Alexandria Borg Tank',
  'Sharm Red Sea Fuel',
  'Hurghada Tank Line',
  'Tel Aviv Ben Gurion Fuel',
  'Haifa Port Tank',
  'Eilat Ramon Haul',
  'Jeddah Red Sea Tank',
  'Riyadh Central Fuel',
  'Dammam Gulf Tank',
  'Medina Fuel Road',
  'Dubai Jet Haul',
  'Abu Dhabi Tank Line',
  'Sharjah Fuel Run',
  'Doha Hamad Tank',
  'Bahrain Island Fuel',
  'Kuwait Shuwaikh Tank',
  'Muscat Jet Road',
  'Salalah South Fuel',
  'Sohar Port Tank',
  'Baghdad Jet Haul',
  'Basra Gulf Tank',
  'Erbil Fuel Road',
  'Tehran Imam Tank',
  'Shiraz Fuel Line',
  'Bandar Abbas Port Tank',
  'Mashhad Tank Run',
  'Amman Queen Alia Tank',
  'Aqaba Red Sea Tank',
  'Beirut Fuel Line',
  'Damascus Tank Run',
  'Latakia Port Tank',
  'Tripoli Mitiga Tank',
  'Misrata Port Tank',
  'Benghazi Fuel Line',
  'Khartoum Tank Run',
  'Port Sudan Red Sea Tank',
  "Sana'a Highland Tank",
  'Aden Gulf Tank',
  'Hodeidah Red Sea Tank',
  'Mukalla Riyan Tank',
  'Karachi Jinnah Tank',
  'Islamabad Fuel Road',
  'Lahore Tank Line',
  'Peshawar Fuel Run',
  'Quetta Highland Tank',
  'Multan Canal Fuel',
  'Delhi IGI Tank',
  'Mumbai Jet Haul',
  'Ahmedabad Fuel Road',
  'Amritsar Tank Line',
  'Pune Fuel Run',
  'Goa Dabolim Tank',
  'Bengaluru Tank Line',
  'Chennai Port Fuel',
  'Hyderabad Fuel Road',
  'Cochin Jet Haul',
  'Kolkata Hooghly Tank',
  'Guwahati Fuel Run',
  'Colombo Bandaranaike Tank',
  'Ratmalana Fuel Road',
  'Mattala Tank Line',
  'Jaffna Fuel Run',
  'Almaty Tank Line',
  'Astana Fuel Road',
  'Aktau Caspian Tank',
  'Shymkent Fuel Run',
  'Tashkent Jet Haul',
  'Samarkand Tank Line',
  'Bukhara Fuel Road',
  'Ashgabat Tank Run',
  'Turkmenbashi Caspian Fuel',
  'Dushanbe Tank Line',
  'Khujand Fuel Road',
  'Kulob Fuel Run',
  'Bishkek Manas Tank',
  'Osh Fergana Fuel',
  'Issyk-Kul Tank Line',
  'Kabul Tank Line',
  'Kandahar Fuel Road',
  'Herat Fuel Run',
  'Mazar-i-Sharif Tank',
  'Kathmandu Tank Line',
  'Pokhara Fuel Road',
  'Dhaka Shahjalal Tank',
  'Chittagong Port Fuel',
  'Sylhet Fuel Run',
  'Paro Tank Line',
  'Gelephu Fuel Road',
  'Yangon Tank Line',
  'Mandalay Fuel Road',
  'Naypyidaw Fuel Run',
  'Sittwe Fuel Run',
  'Suvarnabhumi Tank',
  'Don Mueang Fuel',
  'U-Tapao Fuel Road',
  'Chiang Mai Tank Line',
  'Phuket Tank Line',
  'Hat Yai Fuel Run',
  'Noi Bai Tank Line',
  'Hai Phong Port Fuel',
  'Da Nang Fuel Run',
  'Tan Son Nhat Tank',
  'KLIA Tank Line',
  'Penang Fuel Road',
  'Changi Tank Line',
  'Soekarno-Hatta Tank',
  'Juanda Fuel Road',
  'Kualanamu Tank Line',
  'Ngurah Rai Fuel',
  'Sepinggan Tank Run',
  'Hasanuddin Fuel Road',
  'Kota Kinabalu Tank',
  'Sandakan Fuel Run',
  'Kuching Tank Line',
  'Ninoy Aquino Tank',
  'Clark Fuel Road',
  'Mactan Cebu Tank',
  'Davao Fuel Run',
  'Laguindingan Fuel',
  'Capital Tank Line',
  'Pudong Fuel Road',
  'Hongqiao Fuel',
  'Baiyun Tank Line',
  'Baoan Port Fuel',
  'Shuangliu Tank Run',
  'Narita Tank Line',
  'Haneda Fuel Road',
  'Kansai Tank Run',
  'Fukuoka Fuel',
  'New Chitose Tank',
  'Incheon Tank Line',
  'Gimhae Fuel Road',
  'Jeju Fuel Run',
  'Taoyuan Tank Line',
  'Songshan Fuel Road',
  'Kaohsiung Port Fuel',
  'Kingsford Smith Tank',
  'Tullamarine Fuel Road',
  'Brisbane Tank Line',
  'Perth Fuel Run',
  'Auckland Tank Line',
  'Christchurch Fuel',
  'Xianyang Tank Line',
  'Kunming Fuel Road',
  'Dalian Port Fuel',
  'Honolulu Tank Line',
  'Nadi Fuel Run',
  'Jacksons Tank Line',
  'Tontouta Fuel',
] as const;

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fuelPile(ap: AirportTerminal): { stockKg: number; capacityKg: number } {
  const fuel = ap.inventory.fuel;
  if (!fuel || !(fuel.capacityKg > 0)) {
    return { stockKg: 0, capacityKg: 0 };
  }
  return fuel;
}

function fillOf(ap: AirportTerminal): number {
  const pile = fuelPile(ap);
  if (!(pile.capacityKg > 0)) return 0;
  return clamp(pile.stockKg / pile.capacityKg, 0, 1);
}

function regionsReachable(from: string): Set<string> {
  const out = new Set<string>([from]);
  for (const n of REGION_NEIGHBORS[from] ?? []) out.add(n);
  return out;
}

export function getFuelTruckCapacityKg(truckClassId: FuelTruckClassId): number {
  return FUEL_TRUCK_CAPACITY_KG[truckClassId];
}

/** Road hours for an OD pair (distance + load/unload). */
export function estimateFuelHaulHours(
  world: CareerEconomyWorld,
  originIcao: string,
  destIcao: string,
): number {
  const airNm = routeDistanceNm(world, originIcao, destIcao) ?? 0;
  const roadNm = airNm * ROAD_DISTANCE_FACTOR;
  const driveH = (roadNm * 1.852) / ROAD_SPEED_KMH;
  return Math.max(2, Math.round((driveH + LOAD_UNLOAD_HOURS) * 10) / 10);
}

function makeTruck(opts: {
  id: string;
  name: string;
  truckClassId: FuelTruckClassId;
  homeRegion: string;
}): FuelTruck {
  return {
    id: opts.id,
    name: opts.name,
    truckClassId: opts.truckClassId,
    homeRegion: opts.homeRegion,
    status: 'idle',
  };
}

export function seedFuelTruckFleet(opts: {
  seed: string;
  regions: string[];
}): FuelTruck[] {
  const regionList =
    opts.regions.length > 0
      ? [...new Set(opts.regions)]
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const rng = mulberry32(hashSeed(`${opts.seed}:fuel-trucks`));
  const trucks: FuelTruck[] = [];
  let index = 0;
  const names = [...TRUCK_NAME_POOL];
  // Mild shuffle for variety across seeds.
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  for (const slot of FUEL_TRUCK_COMPOSITION) {
    for (let i = 0; i < slot.count; i++) {
      index += 1;
      trucks.push(
        makeTruck({
          id: `truck-${index}`,
          name: names[index - 1] ?? `${slot.truckClassId}-${index}`,
          truckClassId: slot.truckClassId,
          homeRegion: regionList[(index - 1) % regionList.length]!,
        }),
      );
    }
  }
  return trucks;
}

function topUpFuelTruckFleet(world: CareerEconomyWorld, regions: string[]): void {
  const regionList =
    regions.length > 0
      ? [...new Set(regions)]
      : ['BR-SE', 'BR-S', 'BR-NE', 'BR-N', 'BR-CO'];
  const usedNames = new Set(world.fuelTrucks!.map((t) => t.name));
  let nextIndex = world.fuelTrucks!.reduce((max, t) => {
    const m = /^truck-(\d+)$/.exec(t.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  for (const slot of FUEL_TRUCK_COMPOSITION) {
    const have = world.fuelTrucks!.filter((t) => t.truckClassId === slot.truckClassId)
      .length;
    const missing = Math.max(0, slot.count - have);
    for (let i = 0; i < missing; i++) {
      nextIndex += 1;
      const name =
        TRUCK_NAME_POOL.find((n) => !usedNames.has(n)) ??
        `${slot.truckClassId}-${nextIndex}`;
      usedNames.add(name);
      world.fuelTrucks!.push(
        makeTruck({
          id: `truck-${nextIndex}`,
          name,
          truckClassId: slot.truckClassId,
          homeRegion: regionList[(nextIndex - 1) % regionList.length]!,
        }),
      );
    }
  }
}

/** Ensure save has a fuel-truck fleet; seeds / tops up composition. */
export function ensureFuelTruckFleet(world: CareerEconomyWorld): void {
  if (!Array.isArray(world.fuelHauls)) {
    world.fuelHauls = [];
  }
  const regions = world.airports.map((a) => a.region);
  if (!Array.isArray(world.fuelTrucks) || world.fuelTrucks.length === 0) {
    world.fuelTrucks = seedFuelTruckFleet({ seed: world.seed, regions });
    return;
  }
  topUpFuelTruckFleet(world, regions);
}

function creditDestFuel(world: CareerEconomyWorld, destIcao: string, kg: number): number {
  const dest = world.airports.find((a) => a.icao === destIcao.toUpperCase());
  if (!dest || !(kg > 0)) return 0;
  const pile = dest.inventory.fuel;
  if (!pile) return 0;
  const before = pile.stockKg;
  pile.stockKg = clamp(pile.stockKg + kg, 0, pile.capacityKg);
  return pile.stockKg - before;
}

function debitHubFuel(world: CareerEconomyWorld, originIcao: string, kg: number): number {
  const origin = world.airports.find((a) => a.icao === originIcao.toUpperCase());
  if (!origin || !(kg > 0)) return 0;
  const pile = origin.inventory.fuel;
  if (!pile) return 0;
  const take = Math.min(kg, Math.max(0, pile.stockKg));
  pile.stockKg = Math.max(0, pile.stockKg - take);
  return take;
}

/** Settle due hauls at wall-clock nowMs (mid-hour + batch). */
export function settleFuelHaulsDue(
  world: CareerEconomyWorld,
  nowMs: number,
): { settledHauls: number } {
  ensureFuelTruckFleet(world);
  let settledHauls = 0;
  for (const haul of world.fuelHauls!) {
    if (haul.status !== 'enroute') continue;
    if (nowMs < haul.arrivesAtMs) continue;
    creditDestFuel(world, haul.destIcao, haul.cargoKg);
    haul.status = 'completed';
    settledHauls += 1;
    recordFuelTruckDeliveryActivity(world, haul.destIcao);
    const truck = world.fuelTrucks!.find((t) => t.id === haul.truckId);
    if (truck) {
      const turnH =
        TURNAROUND_MIN_H +
        (hashSeed(`${haul.id}:tt`) % 1000) / 1000 * (TURNAROUND_MAX_H - TURNAROUND_MIN_H);
      truck.status = 'turnaround';
      truck.currentHaulId = undefined;
      truck.busyUntilMs = nowMs + hoursToMs(turnH);
    }
  }

  // Free trucks whose turnaround ended.
  for (const truck of world.fuelTrucks!) {
    if (truck.status !== 'turnaround') continue;
    const until = truck.busyUntilMs ?? 0;
    if (until <= nowMs) {
      truck.status = 'idle';
      truck.busyUntilMs = undefined;
      truck.currentHaulId = undefined;
    }
  }

  // Prune old completed hauls.
  const keepFrom = nowMs - COMPLETED_HAUL_RETENTION_MS;
  world.fuelHauls = world.fuelHauls!.filter(
    (h) => h.status === 'enroute' || h.arrivesAtMs >= keepFrom,
  );

  return { settledHauls };
}

type DispatchCandidate = {
  origin: AirportTerminal;
  dest: AirportTerminal;
  roadNm: number;
  cargoKg: number;
};

function buildDispatchCandidate(
  world: CareerEconomyWorld,
  truck: FuelTruck,
  origin: AirportTerminal,
  dest: AirportTerminal,
): DispatchCandidate | undefined {
  if (FUEL_HUB_ICAOS.has(dest.icao)) return undefined;
  if (!FUEL_HUB_ICAOS.has(origin.icao)) return undefined;

  const destFill = fillOf(dest);
  if (destFill >= DEST_SHORTAGE_FILL) return undefined;

  const originFill = fillOf(origin);
  if (originFill < HUB_SURPLUS_FILL) return undefined;

  const oPile = fuelPile(origin);
  const dPile = fuelPile(dest);
  if (!(oPile.capacityKg > 0) || !(dPile.capacityKg > 0)) return undefined;

  const hubReserveKg = Math.round(oPile.capacityKg * HUB_RESERVE_FILL);
  const availableFromHub = Math.max(0, oPile.stockKg - hubReserveKg);
  if (availableFromHub < MIN_HAUL_KG) return undefined;

  const destTargetKg = Math.round(dPile.capacityKg * DEST_TARGET_FILL);
  const roomToTarget = Math.max(0, destTargetKg - dPile.stockKg);
  if (roomToTarget < MIN_HAUL_KG) return undefined;

  const cap = getFuelTruckCapacityKg(truck.truckClassId);
  const cargoKg = Math.min(cap, availableFromHub, roomToTarget);
  if (cargoKg < MIN_HAUL_KG) return undefined;

  // Prefer same / neighbor region to truck home, then any reachable hub→dest.
  const destRegions = regionsReachable(truck.homeRegion);
  if (!destRegions.has(dest.region) && !destRegions.has(origin.region)) {
    // Still allow if home region has no local shortage — handled by caller ordering.
  }

  const airNm = routeDistanceNm(world, origin.icao, dest.icao);
  if (airNm === undefined || airNm <= 0) return undefined;

  return {
    origin,
    dest,
    roadNm: airNm * ROAD_DISTANCE_FACTOR,
    cargoKg,
  };
}

function inboundEnrouteCount(world: CareerEconomyWorld, destIcao: string): number {
  const code = destIcao.toUpperCase();
  return (world.fuelHauls ?? []).filter(
    (h) => h.status === 'enroute' && h.destIcao === code,
  ).length;
}

function pickBestCandidate(
  world: CareerEconomyWorld,
  truck: FuelTruck,
): DispatchCandidate | undefined {
  const hubs = world.airports.filter((a) => FUEL_HUB_ICAOS.has(a.icao));
  const spokes = world.airports
    .filter(
      (a) =>
        !a.bushTripOnly &&
        !FUEL_HUB_ICAOS.has(a.icao) &&
        fillOf(a) < DEST_SHORTAGE_FILL,
    )
    .filter((a) => inboundEnrouteCount(world, a.icao) < MAX_INBOUND_HAULS)
    .sort((a, b) => fillOf(a) - fillOf(b));

  if (hubs.length === 0 || spokes.length === 0) return undefined;

  const homeReach = regionsReachable(truck.homeRegion);
  const rankedSpokes = [
    ...spokes.filter((s) => homeReach.has(s.region)),
    ...spokes.filter((s) => !homeReach.has(s.region)),
  ];

  let best: DispatchCandidate | undefined;
  for (const dest of rankedSpokes.slice(0, 8)) {
    const destReach = regionsReachable(dest.region);
    const localHubs = hubs.filter(
      (h) => h.region === dest.region || destReach.has(h.region),
    );
    const hubPool = localHubs.length > 0 ? localHubs : hubs;
    for (const origin of hubPool) {
      const cand = buildDispatchCandidate(world, truck, origin, dest);
      if (!cand) continue;
      if (!best || cand.roadNm < best.roadNm - 1e-6) {
        best = cand;
      } else if (
        best &&
        Math.abs(cand.roadNm - best.roadNm) < 1e-6 &&
        fillOf(cand.dest) < fillOf(best.dest)
      ) {
        best = cand;
      }
    }
    // Prefer serving home-region shortages first: if we found a home-region haul, stop.
    if (best && homeReach.has(best.dest.region)) break;
  }
  return best;
}

export function dispatchFuelTrucks(
  world: CareerEconomyWorld,
  opts: { batchNowMs: number; rng: () => number },
): { dispatched: number } {
  ensureFuelTruckFleet(world);
  const { batchNowMs, rng } = opts;
  let dispatched = 0;

  const idle = world.fuelTrucks!.filter((t) => {
    if (t.currentHaulId) return false;
    if (t.status === 'enroute') return false;
    if (t.status === 'turnaround' && (t.busyUntilMs ?? 0) > batchNowMs) return false;
    return true;
  });

  // Mild shuffle so the same truck id does not always win.
  for (let i = idle.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idle[i], idle[j]] = [idle[j]!, idle[i]!];
  }

  for (const truck of idle) {
    truck.status = 'idle';
    truck.busyUntilMs = undefined;
    const pick = pickBestCandidate(world, truck);
    if (!pick) continue;

    const taken = debitHubFuel(world, pick.origin.icao, pick.cargoKg);
    if (taken < MIN_HAUL_KG) {
      // Roll back partial — shouldn't happen with pre-check, but stay safe.
      if (taken > 0) creditDestFuel(world, pick.origin.icao, taken);
      continue;
    }

    const hours = estimateFuelHaulHours(world, pick.origin.icao, pick.dest.icao);
    const staggerMs = Math.floor(rng() * 20 * 60 * 1000);
    const departedAtMs = batchNowMs + staggerMs;
    const arrivesAtMs = departedAtMs + hoursToMs(hours);
    const haul: FuelHaul = {
      id: `fuelh-${world.tick}-${truck.id}-${pick.dest.icao}`,
      truckId: truck.id,
      originIcao: pick.origin.icao,
      destIcao: pick.dest.icao,
      commodityId: 'fuel',
      cargoKg: taken,
      departedAtMs,
      arrivesAtMs,
      status: 'enroute',
    };
    world.fuelHauls!.push(haul);
    truck.status = 'enroute';
    truck.currentHaulId = haul.id;
    truck.busyUntilMs = arrivesAtMs;
    dispatched += 1;
  }

  return { dispatched };
}

/** Settle due hauls then dispatch idle trucks for this economy batch. */
export function tickFuelLogistics(
  world: CareerEconomyWorld,
  rng: () => number,
  opts: { batchNowMs: number },
): { settledHauls: number; dispatched: number } {
  const settled = settleFuelHaulsDue(world, opts.batchNowMs);
  const dispatched = dispatchFuelTrucks(world, {
    batchNowMs: opts.batchNowMs,
    rng,
  });
  return { settledHauls: settled.settledHauls, dispatched: dispatched.dispatched };
}

export function shiftFuelLogisticsWallClock(
  world: CareerEconomyWorld,
  deltaMs: number,
): void {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) return;
  for (const haul of world.fuelHauls ?? []) {
    if (typeof haul.departedAtMs === 'number') haul.departedAtMs += deltaMs;
    if (typeof haul.arrivesAtMs === 'number') haul.arrivesAtMs += deltaMs;
  }
  for (const truck of world.fuelTrucks ?? []) {
    if (typeof truck.busyUntilMs === 'number') truck.busyUntilMs += deltaMs;
  }
}

function haulPhase(haul: FuelHaul, nowMs: number): FuelHaulView['phase'] {
  if (haul.status === 'completed' || nowMs >= haul.arrivesAtMs) return 'delivered';
  if (haul.arrivesAtMs - nowMs <= ARRIVING_WINDOW_MS) return 'arriving';
  return 'enroute';
}

export function listFuelHaulViews(
  world: CareerEconomyWorld,
  opts: { destIcao?: string; originIcao?: string; nowMs?: number } = {},
): FuelHaulView[] {
  ensureFuelTruckFleet(world);
  // Prefer sim batch clock — wall Date.now() desyncs after long sweeps / catch-up.
  const nowMs =
    opts.nowMs ??
    (typeof world.lastBatchAtMs === 'number' && Number.isFinite(world.lastBatchAtMs)
      ? world.lastBatchAtMs
      : Date.now());
  const dest = opts.destIcao?.toUpperCase();
  const origin = opts.originIcao?.toUpperCase();
  const byTruck = new Map(world.fuelTrucks!.map((t) => [t.id, t]));

  return world
    .fuelHauls!.filter((h) => {
      if (dest && h.destIcao !== dest) return false;
      if (origin && h.originIcao !== origin) return false;
      return true;
    })
    .map((h) => {
      const truck = byTruck.get(h.truckId);
      const duration = Math.max(1, h.arrivesAtMs - h.departedAtMs);
      const flown = Math.min(duration, Math.max(0, nowMs - h.departedAtMs));
      const etaMs = Math.max(0, h.arrivesAtMs - nowMs);
      return {
        id: h.id,
        truckId: h.truckId,
        truckName: truck?.name ?? h.truckId,
        truckClassId: truck?.truckClassId ?? 'semi_tanker',
        truckLabel: FUEL_TRUCK_LABEL[truck?.truckClassId ?? 'semi_tanker'],
        originIcao: h.originIcao,
        destIcao: h.destIcao,
        cargoKg: h.cargoKg,
        departedAtMs: h.departedAtMs,
        arrivesAtMs: h.arrivesAtMs,
        etaMs,
        etaHours: Math.round(msToHours(etaMs) * 10) / 10,
        progressPct: Math.min(100, Math.round((flown / duration) * 100)),
        status: h.status,
        phase: haulPhase(h, nowMs),
      };
    })
    .sort((a, b) => a.arrivesAtMs - b.arrivesAtMs);
}

/** Enroute hauls into this airport (for Terminal). */
export function listAirportFuelInbound(
  world: CareerEconomyWorld,
  icao: string,
  nowMs = Date.now(),
): FuelHaulView[] {
  return listFuelHaulViews(world, { destIcao: icao, nowMs }).filter(
    (h) => h.status === 'enroute' && h.phase !== 'delivered',
  );
}

export function countFuelHaulsEnroute(world: CareerEconomyWorld): number {
  return (world.fuelHauls ?? []).filter((h) => h.status === 'enroute').length;
}

/**
 * Region is "fuel thin" when average non-hub fill is low and no inbound haul
 * is headed to any airport in that region.
 */
export function regionFuelThin(
  world: CareerEconomyWorld,
  region: string,
  nowMs = Date.now(),
): boolean {
  const airports = world.airports.filter(
    (a) => a.region === region && !FUEL_HUB_ICAOS.has(a.icao),
  );
  if (airports.length === 0) return false;
  const avg =
    airports.reduce((s, a) => s + fillOf(a), 0) / Math.max(1, airports.length);
  if (avg >= 0.2) return false;
  const inbound = listFuelHaulViews(world, { nowMs }).some(
    (h) =>
      h.status === 'enroute' &&
      world.airports.some((a) => a.icao === h.destIcao && a.region === region),
  );
  return !inbound;
}
