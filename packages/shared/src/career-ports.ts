/**
 * Real-world seaports / ocean-access river ports feeding cheaper “factory”
 * cargo into career hubs. Ports are lat/lon nodes (not airports). Cargo is
 * collected at pickup hubs.
 */

import {
  airportByIcao,
  CAREER_HUB_COORDS,
  getCommodity,
  localUnitPriceUsd,
} from './career-economy.js';
import { cargoOpsIsUnlocked } from './career-cargo-ops.js';
import { applyWalletDelta } from './career-ledger.js';
import { isFboHoldCommodityAllowed, ensurePlayerFbos } from './career-fbo.js';
import {
  depositCargoToWarehouse,
  ensurePlayerWarehouses,
  findPlayerWarehouseAtIcao,
  warehouseInboundFreeKg,
  warehouseFreeKg,
  warehouseInboundTransferTicks,
  playerWarehouseSnapshot,
} from './career-warehouse.js';
import {
  logisticsMultForWarehouse,
  procurementMultForHub,
  yardHoldMultForHub,
} from './career-ground-staff.js';
import {
  creditPortInventory,
  creditPortOperatorThroughput,
  debitPortInventory,
  ensurePortInventoryRestock,
  evaluatePortConcessionClaim,
  findActivePortOperator,
  isPortOperator,
  portInventorySnapshot,
  portListingSlotCap,
  portStockPriceFactor,
  PORT_OPERATOR_ETA_MULT,
  PORT_OPERATOR_PRICE_MULT,
  syncWorldPortConcessions,
  tickPortConcessions,
} from './career-port-concessions.js';
import { demandSnapshot, ensureDemandOrders } from './career-demand.js';
import { LOCAL_COMPANY_ID } from './career-store-v3.js';
import { economyDayIndex } from './career-weather.js';
import type {
  CareerEconomyWorld,
  CareerMissionsState,
  CommodityId,
  PlayerPortPickup,
  PlayerWarehousePile,
  PortListing,
  WarehouseInboundTransfer,
} from './types/career-economy.js';

export type CareerPortDef = {
  id: string;
  name: string;
  /** ISO-ish country (BR, US, …). */
  countryId: string;
  lat: number;
  lon: number;
  /** Preferred collection hubs, first = default. Must be career hubs. */
  pickupHubs: readonly string[];
};

/** Factory list price as a fraction of hub spot (or commodity base fallback). */
export const PORT_FACTORY_PRICE_FRAC = 0.48;
/** Listing spawn jitter around the factory anchor (±12%). */
export const PORT_LISTING_PRICE_JITTER = 0.12;
/** Floor: fraction of commodity basePricePerKg. */
export const PORT_LISTING_PRICE_FLOOR_FRAC = 0.35;
/** Ceiling: fraction of hub spot so factory stays below terminal. */
export const PORT_LISTING_PRICE_CEIL_FRAC = 0.7;

/**
 * Daily yard-hold fee for cargo waiting as port pickup (no WH / WH full).
 * Higher than warehouse storage to push Store in WH.
 */
export const PORT_YARD_HOLD_USD_PER_KG_DAY = 0.05;
export const PORT_YARD_HOLD_VALUE_MULT = 2;
/** Soft UI warning once a yard lot has sat this many economy days. */
export const PORT_YARD_HOLD_WARN_DAYS = 2;

/** Soft cap of simultaneous open listings per port. */
export const PORT_LISTINGS_PER_PORT = 4;

export const CAREER_PORTS: readonly CareerPortDef[] = [
  {
    id: 'BRSSZ',
    name: 'Port of Santos',
    countryId: 'BR',
    lat: -23.952,
    lon: -46.308,
    pickupHubs: ['SBGR', 'SBKP'],
  },
  {
    id: 'BRPNG',
    name: 'Port of Paranaguá',
    countryId: 'BR',
    lat: -25.503,
    lon: -48.508,
    pickupHubs: ['SBCT'],
  },
  {
    id: 'BRSUA',
    name: 'Port of Suape',
    countryId: 'BR',
    lat: -8.4,
    lon: -34.97,
    pickupHubs: ['SBRF'],
  },
  {
    id: 'BRMAO',
    name: 'Port of Manaus',
    countryId: 'BR',
    lat: -3.148,
    lon: -59.987,
    pickupHubs: ['SBEG'],
  },
  {
    id: 'BRRIG',
    name: 'Port of Rio Grande',
    countryId: 'BR',
    lat: -32.13,
    lon: -52.1,
    pickupHubs: ['SBPA'],
  },
  {
    id: 'BRVDC',
    name: 'Port of Vila do Conde',
    countryId: 'BR',
    lat: -1.544,
    lon: -48.747,
    pickupHubs: ['SBBE'],
  },
  {
    id: 'ARBUE',
    name: 'Port of Buenos Aires',
    countryId: 'AR',
    lat: -34.596,
    lon: -58.364,
    pickupHubs: ['SAEZ'],
  },
  {
    id: 'ARCRD',
    name: 'Port of Comodoro Rivadavia',
    countryId: 'AR',
    lat: -45.859,
    lon: -67.456,
    pickupHubs: ['SAVC'],
  },
  {
    id: 'CLSAN',
    name: 'Port of San Antonio',
    countryId: 'CL',
    lat: -33.583,
    lon: -71.617,
    pickupHubs: ['SCEL'],
  },
  {
    id: 'CLPME',
    name: 'Port of Puerto Montt',
    countryId: 'CL',
    lat: -41.467,
    lon: -72.95,
    pickupHubs: ['SCTE'],
  },
  {
    id: 'USMIA',
    name: 'Port of Miami',
    countryId: 'US',
    lat: 25.774,
    lon: -80.171,
    pickupHubs: ['KMIA'],
  },
  {
    id: 'USEWR',
    name: 'Port of New York / New Jersey',
    countryId: 'US',
    // Port Newark / Elizabeth (not downtown Manhattan).
    lat: 40.692,
    lon: -74.154,
    pickupHubs: ['KEWR'],
  },
  {
    id: 'USHOU',
    name: 'Port of Houston',
    countryId: 'US',
    // Barbours Cut container terminal (Galveston Bay) — not inland Turning Basin.
    lat: 29.682,
    lon: -94.998,
    pickupHubs: ['KIAH'],
  },
  {
    id: 'USLAX',
    name: 'Port of Los Angeles / Long Beach',
    countryId: 'US',
    lat: 33.73,
    lon: -118.263,
    pickupHubs: ['KLAX'],
  },
  {
    id: 'USSEA',
    name: 'Port of Seattle',
    countryId: 'US',
    lat: 47.573,
    lon: -122.348,
    pickupHubs: ['KSEA'],
  },
  {
    id: 'CAVAN',
    name: 'Port of Vancouver',
    countryId: 'CA',
    lat: 49.277,
    lon: -123.121,
    pickupHubs: ['CYVR'],
  },
  {
    id: 'CAHAL',
    name: 'Port of Halifax',
    countryId: 'CA',
    lat: 44.63,
    lon: -63.56,
    pickupHubs: ['CYHZ'],
  },
  {
    id: 'MXVER',
    name: 'Port of Veracruz',
    countryId: 'MX',
    lat: 19.198,
    lon: -96.129,
    pickupHubs: ['MMVR'],
  },
  {
    id: 'MXZLO',
    name: 'Port of Manzanillo',
    countryId: 'MX',
    lat: 19.065,
    lon: -104.305,
    pickupHubs: ['MMZO'],
  },
  {
    id: 'MXCUN',
    name: 'Port of Cancún',
    countryId: 'MX',
    // Puerto Juárez ferry / coastal terminal (not MMUN airport).
    lat: 21.185,
    lon: -86.807,
    pickupHubs: ['MMUN'],
  },
  {
    id: 'UYMVD',
    name: 'Port of Montevideo',
    countryId: 'UY',
    lat: -34.9,
    lon: -56.21,
    pickupHubs: ['SUMU'],
  },
  {
    id: 'PECLL',
    name: 'Port of Callao',
    countryId: 'PE',
    lat: -12.05,
    lon: -77.15,
    pickupHubs: ['SPJC'],
  },
  {
    id: 'ECGYE',
    name: 'Port of Guayaquil',
    countryId: 'EC',
    lat: -2.28,
    lon: -79.9,
    pickupHubs: ['SEGU'],
  },
  {
    id: 'COCTG',
    name: 'Port of Cartagena',
    countryId: 'CO',
    lat: 10.4,
    lon: -75.53,
    pickupHubs: ['SKCG', 'SKBQ'],
  },
  {
    id: 'COBUN',
    name: 'Port of Buenaventura',
    countryId: 'CO',
    lat: 3.89,
    lon: -77.08,
    pickupHubs: ['SKCL', 'SKBU'],
  },
  {
    id: 'VELAG',
    name: 'Port of La Guaira',
    countryId: 'VE',
    lat: 10.6,
    lon: -66.93,
    pickupHubs: ['SVMI'],
  },
  {
    id: 'GYGEO',
    name: 'Port of Georgetown',
    countryId: 'GY',
    lat: 6.8,
    lon: -58.17,
    pickupHubs: ['SYCJ', 'SYEC'],
  },
  {
    id: 'SRPBM',
    name: 'Port of Paramaribo',
    countryId: 'SR',
    lat: 5.82,
    lon: -55.17,
    pickupHubs: ['SMJP', 'SMZO'],
  },
  {
    id: 'GFCAY',
    name: 'Port of Cayenne',
    countryId: 'GF',
    lat: 4.93,
    lon: -52.33,
    pickupHubs: ['SOCA'],
  },
  {
    id: 'PAPTY',
    name: 'Port of Balboa',
    countryId: 'PA',
    lat: 8.95,
    lon: -79.56,
    pickupHubs: ['MPTO', 'MPMG'],
  },
  {
    id: 'CRLIM',
    name: 'Port of Limon',
    countryId: 'CR',
    lat: 10.0,
    lon: -83.03,
    pickupHubs: ['MRLM', 'MROC'],
  },
  {
    id: 'NICOR',
    name: 'Port of Corinto',
    countryId: 'NI',
    lat: 12.48,
    lon: -87.17,
    pickupHubs: ['MNMG'],
  },
  {
    id: 'HNPCS',
    name: 'Port of Puerto Cortes',
    countryId: 'HN',
    lat: 15.84,
    lon: -87.94,
    pickupHubs: ['MHLM'],
  },
  {
    id: 'SVACA',
    name: 'Port of Acajutla',
    countryId: 'SV',
    lat: 13.59,
    lon: -89.83,
    pickupHubs: ['MSLP'],
  },
  {
    id: 'GTPQ',
    name: 'Port of Puerto Quetzal',
    countryId: 'GT',
    lat: 13.92,
    lon: -90.79,
    pickupHubs: ['MGGT', 'MGSJ'],
  },
  {
    id: 'BZBLZ',
    name: 'Port of Belize City',
    countryId: 'BZ',
    lat: 17.48,
    lon: -88.2,
    pickupHubs: ['MZBZ'],
  },
  {
    id: 'CUHAV',
    name: 'Port of Havana',
    countryId: 'CU',
    lat: 23.13,
    lon: -82.35,
    pickupHubs: ['MUHA'],
  },
  {
    id: 'DOSDQ',
    name: 'Port of Caucedo',
    countryId: 'DO',
    lat: 18.42,
    lon: -69.63,
    pickupHubs: ['MDSD'],
  },
  {
    id: 'HTPAP',
    name: 'Port of Port-au-Prince',
    countryId: 'HT',
    lat: 18.55,
    lon: -72.35,
    pickupHubs: ['MTPP'],
  },
  {
    id: 'JMKIN',
    name: 'Port of Kingston',
    countryId: 'JM',
    lat: 17.98,
    lon: -76.82,
    pickupHubs: ['MKJP'],
  },
  {
    id: 'BSNAS',
    name: 'Port of Nassau',
    countryId: 'BS',
    lat: 25.08,
    lon: -77.35,
    pickupHubs: ['MYNN'],
  },
  {
    id: 'TTPOS',
    name: 'Port of Port of Spain',
    countryId: 'TT',
    lat: 10.65,
    lon: -61.52,
    pickupHubs: ['TTPP'],
  },
  {
    id: 'BBBGI',
    name: 'Port of Bridgetown',
    countryId: 'BB',
    lat: 13.1,
    lon: -59.63,
    pickupHubs: ['TBPB'],
  },
  {
    id: 'LCCAS',
    name: 'Port of Castries',
    countryId: 'LC',
    lat: 14.01,
    lon: -61.0,
    pickupHubs: ['TLPL', 'TLPC'],
  },
  {
    id: 'GDSTG',
    name: 'Port of St Georges',
    countryId: 'GD',
    lat: 12.05,
    lon: -61.75,
    pickupHubs: ['TGPY'],
  },
  {
    id: 'AGANU',
    name: 'Port of St Johns',
    countryId: 'AG',
    lat: 17.12,
    lon: -61.85,
    pickupHubs: ['TAPA'],
  },
  {
    id: 'USSJU',
    name: 'Port of San Juan',
    countryId: 'US',
    lat: 18.46,
    lon: -66.11,
    pickupHubs: ['TJSJ'],
  },
  {
    id: 'GPPTP',
    name: 'Port of Pointe-a-Pitre',
    countryId: 'GP',
    lat: 16.23,
    lon: -61.54,
    pickupHubs: ['TFFR'],
  },
  {
    id: 'MQFDF',
    name: 'Port of Fort-de-France',
    countryId: 'MQ',
    lat: 14.6,
    lon: -61.07,
    pickupHubs: ['TFFF'],
  },
  {
    id: 'CWWIL',
    name: 'Port of Willemstad',
    countryId: 'CW',
    lat: 12.12,
    lon: -68.93,
    pickupHubs: ['TNCC'],
  },
  {
    id: 'SXPHI',
    name: 'Port of Philipsburg',
    countryId: 'SX',
    lat: 18.03,
    lon: -63.05,
    pickupHubs: ['TNCM'],
  },
  {
    id: 'AWORJ',
    name: 'Port of Oranjestad',
    countryId: 'AW',
    lat: 12.52,
    lon: -70.04,
    pickupHubs: ['TNCA'],
  },
  {
    id: 'USSTT',
    name: 'Port of Charlotte Amalie',
    countryId: 'US',
    lat: 18.33,
    lon: -64.93,
    pickupHubs: ['TIST'],
  },
  {
    id: 'PTLIS',
    name: 'Port of Lisbon',
    countryId: 'PT',
    lat: 38.7,
    lon: -9.17,
    pickupHubs: ['LPPT'],
  },
  {
    id: 'ESBCN',
    name: 'Port of Barcelona',
    countryId: 'ES',
    lat: 41.35,
    lon: 2.17,
    pickupHubs: ['LEBL'],
  },
  {
    id: 'FRMRS',
    name: 'Port of Marseille',
    countryId: 'FR',
    lat: 43.34,
    lon: 5.33,
    pickupHubs: ['LFML'],
  },
  {
    id: 'GBSOU',
    name: 'Port of Southampton',
    countryId: 'GB',
    lat: 50.9,
    lon: -1.4,
    pickupHubs: ['EGHI'],
  },
  {
    id: 'DEHAM',
    name: 'Port of Hamburg',
    countryId: 'DE',
    lat: 53.54,
    lon: 9.98,
    pickupHubs: ['EDDH'],
  },
  {
    id: 'NLRTM',
    name: 'Port of Rotterdam',
    countryId: 'NL',
    lat: 51.95,
    lon: 4.14,
    pickupHubs: ['EHRD'],
  },
  {
    id: 'BEANR',
    name: 'Port of Antwerp',
    countryId: 'BE',
    lat: 51.27,
    lon: 4.36,
    pickupHubs: ['EBAW'],
  },
  {
    id: 'ITNAP',
    name: 'Port of Naples',
    countryId: 'IT',
    lat: 40.84,
    lon: 14.27,
    pickupHubs: ['LIRN'],
  },
  {
    id: 'IEDUB',
    name: 'Port of Dublin',
    countryId: 'IE',
    lat: 53.35,
    lon: -6.2,
    pickupHubs: ['EIDW'],
  },
  {
    id: 'DKCPH',
    name: 'Port of Copenhagen',
    countryId: 'DK',
    lat: 55.7,
    lon: 12.6,
    pickupHubs: ['EKCH'],
  },
  {
    id: 'NOOSL',
    name: 'Port of Oslo',
    countryId: 'NO',
    lat: 59.9,
    lon: 10.75,
    pickupHubs: ['ENGM'],
  },
  {
    id: 'SEGOT',
    name: 'Port of Gothenburg',
    countryId: 'SE',
    lat: 57.7,
    lon: 11.95,
    pickupHubs: ['ESGG'],
  },
  {
    id: 'FIHEL',
    name: 'Port of Helsinki',
    countryId: 'FI',
    lat: 60.15,
    lon: 24.95,
    pickupHubs: ['EFHK'],
  },
  {
    id: 'PLGDN',
    name: 'Port of Gdansk',
    countryId: 'PL',
    lat: 54.38,
    lon: 18.66,
    pickupHubs: ['EPGD'],
  },
  {
    id: 'EETLL',
    name: 'Port of Tallinn',
    countryId: 'EE',
    lat: 59.45,
    lon: 24.75,
    pickupHubs: ['EETN'],
  },
  {
    id: 'LVRIX',
    name: 'Port of Riga',
    countryId: 'LV',
    lat: 56.95,
    lon: 24.1,
    pickupHubs: ['EVRA'],
  },
  {
    id: 'LTKLJ',
    name: 'Port of Klaipeda',
    countryId: 'LT',
    lat: 55.7,
    lon: 21.14,
    pickupHubs: ['EYPA'],
  },
  {
    id: 'HRSPL',
    name: 'Port of Split',
    countryId: 'HR',
    lat: 43.5,
    lon: 16.43,
    pickupHubs: ['LDSP'],
  },
  {
    id: 'SIKOP',
    name: 'Port of Koper',
    countryId: 'SI',
    lat: 45.55,
    lon: 13.73,
    pickupHubs: ['LJLJ'],
  },
  {
    id: 'BGVAR',
    name: 'Port of Varna',
    countryId: 'BG',
    lat: 43.2,
    lon: 27.92,
    pickupHubs: ['LBWN'],
  },
  {
    id: 'GRPIR',
    name: 'Port of Piraeus',
    countryId: 'GR',
    lat: 37.94,
    lon: 23.64,
    pickupHubs: ['LGAV'],
  },
  {
    id: 'ISREK',
    name: 'Port of Reykjavik',
    countryId: 'IS',
    lat: 64.15,
    lon: -21.94,
    pickupHubs: ['BIRK', 'BIKF'],
  },
  {
    id: 'MEDUR',
    name: 'Port of Bar',
    countryId: 'ME',
    lat: 42.09,
    lon: 19.09,
    pickupHubs: ['LYPG', 'LYTV'],
  },
  {
    id: 'ALDUR',
    name: 'Port of Durres',
    countryId: 'AL',
    lat: 41.31,
    lon: 19.45,
    pickupHubs: ['LATI'],
  },
  {
    id: 'TRIST',
    name: 'Port of Istanbul',
    countryId: 'TR',
    lat: 41.0,
    lon: 28.95,
    pickupHubs: ['LTFM', 'LTFJ'],
  },
  {
    id: 'TRIZM',
    name: 'Port of Izmir',
    countryId: 'TR',
    lat: 38.44,
    lon: 27.15,
    pickupHubs: ['LTBJ'],
  },
  {
    id: 'UAODE',
    name: 'Port of Odesa',
    countryId: 'UA',
    lat: 46.48,
    lon: 30.73,
    pickupHubs: ['UKOO'],
  },
  {
    id: 'GEBAT',
    name: 'Port of Batumi',
    countryId: 'GE',
    lat: 41.65,
    lon: 41.65,
    pickupHubs: ['UGSB'],
  },
  {
    id: 'AZBAK',
    name: 'Port of Baku',
    countryId: 'AZ',
    lat: 40.37,
    lon: 49.88,
    pickupHubs: ['UBBB'],
  },
  {
    id: 'MTMLA',
    name: 'Port of Marsaxlokk',
    countryId: 'MT',
    lat: 35.83,
    lon: 14.55,
    pickupHubs: ['LMML'],
  },
  {
    id: 'CYLIM',
    name: 'Port of Limassol',
    countryId: 'CY',
    lat: 34.67,
    lon: 33.05,
    pickupHubs: ['LCLK'],
  },
  {
    id: 'MATNG',
    name: 'Tangier Med',
    countryId: 'MA',
    lat: 35.89,
    lon: -5.5,
    pickupHubs: ['GMTT'],
  },
  {
    id: 'DZALG',
    name: 'Port of Algiers',
    countryId: 'DZ',
    lat: 36.77,
    lon: 3.07,
    pickupHubs: ['DAAG'],
  },
  {
    id: 'TNTUN',
    name: 'Tunis Radès',
    countryId: 'TN',
    lat: 36.8,
    lon: 10.28,
    pickupHubs: ['DTTA'],
  },
  {
    id: 'EGALY',
    name: 'Port of Alexandria',
    countryId: 'EG',
    lat: 31.18,
    lon: 29.88,
    pickupHubs: ['HEBA'],
  },
  {
    id: 'ILHFA',
    name: 'Port of Haifa',
    countryId: 'IL',
    lat: 32.82,
    lon: 35.0,
    pickupHubs: ['LLHA'],
  },
  {
    id: 'SAJED',
    name: 'Jeddah Islamic Port',
    countryId: 'SA',
    lat: 21.48,
    lon: 39.16,
    pickupHubs: ['OEJN'],
  },
  {
    id: 'SADMM',
    name: 'King Abdulaziz Port Dammam',
    countryId: 'SA',
    lat: 26.5,
    lon: 50.2,
    pickupHubs: ['OEDF'],
  },
  {
    id: 'AEJEA',
    name: 'Jebel Ali',
    countryId: 'AE',
    lat: 25.01,
    lon: 55.06,
    pickupHubs: ['OMDB'],
  },
  {
    id: 'AEKHL',
    name: 'Khalifa Port',
    countryId: 'AE',
    lat: 24.8,
    lon: 54.65,
    pickupHubs: ['OMAA'],
  },
  {
    id: 'QAHMD',
    name: 'Hamad Port',
    countryId: 'QA',
    lat: 25.02,
    lon: 51.6,
    pickupHubs: ['OTHH'],
  },
  {
    id: 'BHKBS',
    name: 'Khalifa Bin Salman Port',
    countryId: 'BH',
    lat: 26.2,
    lon: 50.62,
    pickupHubs: ['OBBI'],
  },
  {
    id: 'KWSHW',
    name: 'Shuwaikh Port',
    countryId: 'KW',
    lat: 29.35,
    lon: 47.93,
    pickupHubs: ['OKKK'],
  },
  {
    id: 'OMSLL',
    name: 'Sultan Qaboos / Sohar',
    countryId: 'OM',
    lat: 23.63,
    lon: 58.57,
    pickupHubs: ['OOMS'],
  },
  {
    id: 'IQBSR',
    name: 'Um Qasr / Basra',
    countryId: 'IQ',
    lat: 30.03,
    lon: 47.95,
    pickupHubs: ['ORMM'],
  },
  {
    id: 'IRBND',
    name: 'Bandar Abbas',
    countryId: 'IR',
    lat: 27.18,
    lon: 56.27,
    pickupHubs: ['OIKB'],
  },
  {
    id: 'JOAQB',
    name: 'Aqaba',
    countryId: 'JO',
    lat: 29.52,
    lon: 35.0,
    pickupHubs: ['OJAQ'],
  },
  {
    id: 'LBBEY',
    name: 'Beirut',
    countryId: 'LB',
    lat: 33.9,
    lon: 35.52,
    pickupHubs: ['OLBA'],
  },
  {
    id: 'SYLTK',
    name: 'Latakia',
    countryId: 'SY',
    lat: 35.52,
    lon: 35.78,
    pickupHubs: ['OSLK'],
  },
  {
    id: 'LYMRA',
    name: 'Misrata',
    countryId: 'LY',
    lat: 32.37,
    lon: 15.09,
    pickupHubs: ['HLMS'],
  },
  {
    id: 'SDPZU',
    name: 'Port Sudan',
    countryId: 'SD',
    lat: 19.62,
    lon: 37.22,
    pickupHubs: ['HSPN'],
  },
  {
    id: 'YEADN',
    name: 'Aden',
    countryId: 'YE',
    lat: 12.79,
    lon: 44.98,
    pickupHubs: ['OYAA'],
  },
  {
    id: 'YEHOD',
    name: 'Hodeidah',
    countryId: 'YE',
    lat: 14.8,
    lon: 42.95,
    pickupHubs: ['OYHD'],
  },
  {
    id: 'PKKHI',
    name: 'Karachi',
    countryId: 'PK',
    lat: 24.85,
    lon: 66.98,
    pickupHubs: ['OPKC'],
  },
  {
    id: 'INBOM',
    name: 'Mumbai',
    countryId: 'IN',
    lat: 18.95,
    lon: 72.85,
    pickupHubs: ['VABB'],
  },
  {
    id: 'INMAA',
    name: 'Chennai',
    countryId: 'IN',
    lat: 13.08,
    lon: 80.29,
    pickupHubs: ['VOMM'],
  },
  {
    id: 'INCCU',
    name: 'Kolkata',
    countryId: 'IN',
    lat: 22.55,
    lon: 88.3,
    pickupHubs: ['VECC'],
  },
  {
    id: 'LKCMB',
    name: 'Colombo',
    countryId: 'LK',
    lat: 6.95,
    lon: 79.85,
    pickupHubs: ['VCBI'],
  },
  {
    id: 'KZAKT',
    name: 'Aktau',
    countryId: 'KZ',
    lat: 43.65,
    lon: 51.17,
    pickupHubs: ['UATE'],
  },
  {
    id: 'TMKRW',
    name: 'Turkmenbashi',
    countryId: 'TM',
    lat: 40.02,
    lon: 52.97,
    pickupHubs: ['UTAK'],
  },
];

const PORT_BY_ID = new Map(CAREER_PORTS.map((p) => [p.id, p]));

const PORT_CARGO: readonly CommodityId[] = [
  'general',
  'supplies',
  'machinery',
  'electronics',
];

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function nextId(prefix: string, tick: number): string {
  return `${prefix}_${tick}_${Math.floor(Math.random() * 1e6)}`;
}

export function listCareerPorts(): readonly CareerPortDef[] {
  return CAREER_PORTS;
}

export function getCareerPort(portId: string): CareerPortDef | undefined {
  return PORT_BY_ID.get(portId.trim().toUpperCase());
}

export function resolvePortPickupHub(
  port: CareerPortDef,
  preferredIcao?: string,
): string {
  const pref = preferredIcao?.trim().toUpperCase();
  if (pref && port.pickupHubs.includes(pref)) return pref;
  return port.pickupHubs[0]!;
}

/** Static factory floor (no hub context) — used as fallback / tests. */
export function portFactoryUnitPriceUsd(commodityId: CommodityId): number {
  return money(getCommodity(commodityId).basePricePerKg * PORT_FACTORY_PRICE_FRAC);
}

/**
 * Dynamic factory unit price for a new listing, frozen at spawn.
 * Anchored to allocated-hub spot × factory frac, stock scarcity, jitter + clamp.
 */
export function quotePortListingUnitPriceUsd(
  world: CareerEconomyWorld,
  opts: {
    commodityId: CommodityId;
    allocatedHubIcao: string;
    portId?: string;
    rng?: () => number;
  },
): { unitPriceUsd: number; hubSpotUnitPriceUsd: number | null } {
  const commodityId = opts.commodityId;
  const base = getCommodity(commodityId).basePricePerKg;
  const hubSpot = hubSpotUnitPriceUsd(world, opts.allocatedHubIcao, commodityId);
  const anchor =
    hubSpot != null && hubSpot > 0
      ? hubSpot * PORT_FACTORY_PRICE_FRAC
      : base * PORT_FACTORY_PRICE_FRAC;
  const rng = opts.rng ?? (() => 0.5);
  const jitter =
    1 - PORT_LISTING_PRICE_JITTER + rng() * (2 * PORT_LISTING_PRICE_JITTER);
  const stockFactor = opts.portId
    ? portStockPriceFactor(world, opts.portId, commodityId)
    : 1;
  let unit = anchor * jitter * stockFactor;
  const floor = base * PORT_LISTING_PRICE_FLOOR_FRAC;
  const ceil =
    hubSpot != null && hubSpot > 0
      ? hubSpot * PORT_LISTING_PRICE_CEIL_FRAC
      : base * PORT_LISTING_PRICE_CEIL_FRAC;
  unit = Math.min(Math.max(unit, floor), ceil);
  // Never quote at/above live hub spot.
  if (hubSpot != null && hubSpot > 0 && unit >= hubSpot) {
    unit = hubSpot * PORT_FACTORY_PRICE_FRAC;
  }
  return { unitPriceUsd: money(unit), hubSpotUnitPriceUsd: hubSpot };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed / top-up port catalog listings from passive inventory. */
export function ensurePortListings(world: CareerEconomyWorld): PortListing[] {
  ensurePortInventoryRestock(world);
  if (!Array.isArray(world.portListings)) {
    world.portListings = [];
  }
  const listings = world.portListings;
  const rng = mulberry32(hashSeed(`${world.seed}:ports:${world.tick}`));

  // Return unused kg from expired open listings to inventory.
  for (const l of listings) {
    if (
      l.status === 'open' &&
      l.expiresAtTick <= world.tick &&
      l.availableKg > 0
    ) {
      creditPortInventory(world, l.portId, l.commodityId, l.availableKg);
      l.availableKg = 0;
      l.status = 'expired';
    }
  }

  for (const port of CAREER_PORTS) {
    const slotCap = portListingSlotCap(world, port.id);
    const open = listings.filter(
      (l) =>
        l.portId === port.id &&
        l.status === 'open' &&
        l.availableKg > 0 &&
        l.expiresAtTick > world.tick,
    );
    let need = slotCap - open.length;
    let guard = 0;
    let slot = 0;
    while (need > 0 && guard++ < 16) {
      const commodityId = PORT_CARGO[Math.floor(rng() * PORT_CARGO.length)]!;
      const hub =
        slot === 0
          ? port.pickupHubs[0]!
          : (port.pickupHubs[Math.floor(rng() * port.pickupHubs.length)] ??
            port.pickupHubs[0]!);
      slot += 1;
      if (!airportByIcao(world, hub)) {
        need -= 1;
        continue;
      }
      const wantedKg =
        commodityId === 'machinery' || commodityId === 'electronics'
          ? 8_000 + Math.floor(rng() * 22_000)
          : 20_000 + Math.floor(rng() * 80_000);
      const taken = debitPortInventory(world, port.id, commodityId, wantedKg);
      if (taken < 2_000) {
        if (taken > 0) {
          creditPortInventory(world, port.id, commodityId, taken);
        }
        need -= 1;
        continue;
      }
      const quoted = quotePortListingUnitPriceUsd(world, {
        commodityId,
        allocatedHubIcao: hub,
        portId: port.id,
        rng,
      });
      listings.push({
        id: nextId('portlot', world.tick),
        portId: port.id,
        commodityId,
        availableKg: taken,
        unitPriceUsd: quoted.unitPriceUsd,
        allocatedHubIcao: hub,
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 96 * 3, // ~3 economy days
        status: 'open',
      });
      need -= 1;
    }
  }

  world.portListings = listings.filter(
    (l) =>
      !(
        (l.status === 'open' &&
          (l.availableKg <= 0 || l.expiresAtTick <= world.tick)) ||
        l.status === 'expired' ||
        l.status === 'sold_out'
      ),
  );
  return world.portListings;
}

export function listPortListings(
  world: CareerEconomyWorld,
  portId?: string,
): PortListing[] {
  ensurePortListings(world);
  const id = portId?.trim().toUpperCase();
  return (world.portListings ?? []).filter(
    (l) =>
      l.status === 'open' &&
      l.availableKg > 0 &&
      l.expiresAtTick > world.tick &&
      (!id || l.portId === id),
  );
}

export function normalizePlayerPortPickups(raw: unknown): PlayerPortPickup[] {
  if (!Array.isArray(raw)) return [];
  const out: PlayerPortPickup[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const portId = typeof r.portId === 'string' ? r.portId.trim().toUpperCase() : '';
    const hubIcao =
      typeof r.hubIcao === 'string' ? r.hubIcao.trim().toUpperCase() : '';
    const commodityId =
      typeof r.commodityId === 'string' ? (r.commodityId as CommodityId) : null;
    const kg =
      typeof r.kg === 'number' && Number.isFinite(r.kg)
        ? Math.max(0, Math.floor(r.kg))
        : 0;
    const avgCostUsdPerKg =
      typeof r.avgCostUsdPerKg === 'number' && Number.isFinite(r.avgCostUsdPerKg)
        ? Math.max(0, money(r.avgCostUsdPerKg))
        : 0;
    const purchasedAtTick =
      typeof r.purchasedAtTick === 'number' && Number.isFinite(r.purchasedAtTick)
        ? Math.max(0, Math.floor(r.purchasedAtTick))
        : 0;
    const listingId =
      typeof r.listingId === 'string' ? r.listingId.trim() : undefined;
    if (!id || !portId || !hubIcao || !commodityId || kg <= 0) continue;
    out.push({
      id,
      portId,
      hubIcao,
      commodityId,
      kg,
      avgCostUsdPerKg,
      purchasedAtTick,
      ...(listingId ? { listingId } : {}),
    });
  }
  return out;
}

export function ensurePlayerPortPickups(
  state: CareerMissionsState,
): PlayerPortPickup[] {
  state.portPickups = normalizePlayerPortPickups(state.portPickups);
  return state.portPickups;
}

/**
 * Buy kg from a port listing → inbound WH transfer and/or yard pickup.
 * Cargo does not teleport into WH stock; it arrives after transfer ticks.
 */
export function buyPortListing(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { listingId: string; kg: number },
): {
  debitUsd: number;
  unitPriceUsd: number;
  kg: number;
  /** @deprecated Always 0 on buy — use inboundKg (arrives later). */
  storedKg: number;
  inboundKg: number;
  yardKg: number;
  transferTicks: number;
  readyAtTick: number | null;
  pickup: PlayerPortPickup | null;
  inboundTransfer: WarehouseInboundTransfer | null;
  warehousePile: PlayerWarehousePile | null;
  listing: PortListing;
} {
  ensurePortListings(world);
  const qty = Math.max(0, Math.floor(opts.kg));
  if (qty <= 0) throw new Error('Buy amount must be positive');

  const listing = (world.portListings ?? []).find(
    (l) => l.id === opts.listingId.trim(),
  );
  if (!listing || listing.status !== 'open' || listing.availableKg <= 0) {
    throw new Error('Port listing not available');
  }
  if (listing.expiresAtTick <= world.tick) {
    throw new Error('Port listing expired');
  }
  if (!isFboHoldCommodityAllowed(listing.commodityId)) {
    throw new Error('Commodity not allowed from ports');
  }
  if (!cargoOpsIsUnlocked(state.cargoOps, listing.commodityId)) {
    const name = getCommodity(listing.commodityId).name;
    throw new Error(
      `Cargo Ops: ${name} is locked — unlock it in Hangar → Cargo Ops`,
    );
  }
  if (qty > listing.availableKg) {
    throw new Error(
      `Only ${listing.availableKg.toLocaleString()} kg left on this listing`,
    );
  }

  const port = getCareerPort(listing.portId);
  if (!port) throw new Error(`Unknown port ${listing.portId}`);

  const hub = listing.allocatedHubIcao.trim().toUpperCase();
  if (!port.pickupHubs.includes(hub)) {
    throw new Error(`Hub ${hub} is not a pickup for ${port.name}`);
  }
  if (!airportByIcao(world, hub)) {
    throw new Error(`Unknown pickup hub ${hub}`);
  }

  const rawUnit = money(
    listing.unitPriceUsd *
      procurementMultForHub(state, hub) *
      (isPortOperator(world, listing.portId, LOCAL_COMPANY_ID)
        ? PORT_OPERATOR_PRICE_MULT
        : 1),
  );
  // Soft floor: stacked discounts cannot drop below 75% of listing unit.
  const unitPriceUsd = money(
    Math.max(rawUnit, listing.unitPriceUsd * 0.75),
  );
  const debitUsd = money(unitPriceUsd * qty);
  if (state.walletUsd < debitUsd) {
    throw new Error(
      `Port buy $${debitUsd.toLocaleString()} exceeds wallet $${state.walletUsd.toLocaleString()}`,
    );
  }

  listing.availableKg -= qty;
  if (listing.availableKg <= 0) {
    listing.status = 'sold_out';
    listing.availableKg = 0;
  }

  applyWalletDelta(state, {
    amountUsd: -debitUsd,
    kind: 'port_buy',
    atTick: world.tick,
    icao: hub,
    note: `${port.name} · ${listing.commodityId} · ${qty} kg @ $${unitPriceUsd}/kg → ${hub}`,
  });

  creditPortOperatorThroughput(state, world, listing.portId, qty);

  const wh = findPlayerWarehouseAtIcao(state, hub);
  const free = wh ? warehouseInboundFreeKg(state, wh.id) : 0;
  const inboundKg = wh ? Math.min(qty, Math.max(0, free)) : 0;
  const yardKg = qty - inboundKg;
  const logisticsMult = wh ? logisticsMultForWarehouse(state, wh.id) : 1;
  const operatorEta = isPortOperator(world, listing.portId, LOCAL_COMPANY_ID)
    ? PORT_OPERATOR_ETA_MULT
    : 1;
  const transferTicks =
    inboundKg > 0
      ? warehouseInboundTransferTicks(inboundKg, logisticsMult * operatorEta)
      : 0;
  const readyAtTick =
    inboundKg > 0 ? world.tick + transferTicks : null;

  let inboundTransfer: WarehouseInboundTransfer | null = null;
  if (inboundKg > 0 && wh && readyAtTick != null) {
    inboundTransfer = {
      id: nextId('whin', world.tick),
      warehouseId: wh.id,
      hubIcao: hub,
      portId: listing.portId,
      listingId: listing.id,
      commodityId: listing.commodityId,
      kg: inboundKg,
      unitCostUsd: unitPriceUsd,
      purchasedAtTick: world.tick,
      readyAtTick,
    };
    ensurePlayerWarehouses(state).inboundTransfers!.push(inboundTransfer);
  }

  let pickup: PlayerPortPickup | null = null;
  if (yardKg > 0) {
    pickup = {
      id: nextId('portpk', world.tick),
      portId: listing.portId,
      listingId: listing.id,
      hubIcao: hub,
      commodityId: listing.commodityId,
      kg: yardKg,
      avgCostUsdPerKg: unitPriceUsd,
      purchasedAtTick: world.tick,
    };
    ensurePlayerPortPickups(state).push(pickup);
  }

  return {
    debitUsd,
    unitPriceUsd,
    kg: qty,
    storedKg: 0,
    inboundKg,
    yardKg,
    transferTicks,
    readyAtTick,
    pickup,
    inboundTransfer,
    warehousePile: null,
    listing: { ...listing },
  };
}

/**
 * Move port pickup kg into the player warehouse at the same ICAO (no flight).
 * Defaults to as much as fits in free WH capacity (partial store allowed).
 */
export function depositPortPickupToWarehouse(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string; kg?: number },
): {
  pile: PlayerWarehousePile;
  kg: number;
  hubIcao: string;
  remainingYardKg: number;
} {
  const pickups = ensurePlayerPortPickups(state);
  const idx = pickups.findIndex((p) => p.id === opts.pickupId.trim());
  if (idx < 0) throw new Error('Port pickup not found');
  const pickup = pickups[idx]!;
  const hub = pickup.hubIcao.trim().toUpperCase();
  const wh = findPlayerWarehouseAtIcao(state, hub);
  if (!wh) {
    throw new Error(`No warehouse at ${hub}`);
  }
  const free = warehouseFreeKg(state, wh.id);
  if (free <= 0) {
    throw new Error(`Warehouse at ${hub} has no free capacity`);
  }
  const want =
    opts.kg != null && Number.isFinite(opts.kg)
      ? Math.max(0, Math.floor(opts.kg))
      : pickup.kg;
  const take = Math.min(want, pickup.kg, free);
  if (take <= 0) {
    throw new Error('Nothing to store');
  }

  const pile = depositCargoToWarehouse(state, {
    icao: hub,
    commodityId: pickup.commodityId,
    kg: take,
    avgCostUsdPerKg: pickup.avgCostUsdPerKg,
    tick: world.tick,
  });

  pickup.kg -= take;
  if (pickup.kg <= 0) {
    pickups.splice(idx, 1);
  }

  return {
    pile,
    kg: take,
    hubIcao: hub,
    remainingYardKg: Math.max(0, pickup.kg),
  };
}

/** Drop yard-hold cargo (no refund) so oversized pickups can stop accruing fees. */
export function abandonPortPickup(
  state: CareerMissionsState,
  opts: { pickupId: string },
): { kg: number; hubIcao: string; commodityId: CommodityId } {
  const pickups = ensurePlayerPortPickups(state);
  const idx = pickups.findIndex((p) => p.id === opts.pickupId.trim());
  if (idx < 0) throw new Error('Port pickup not found');
  const pickup = pickups[idx]!;
  const kg = pickup.kg;
  const hubIcao = pickup.hubIcao;
  const commodityId = pickup.commodityId;
  pickups.splice(idx, 1);
  return { kg, hubIcao, commodityId };
}

function yardHoldUsdPerKgDay(commodityId: CommodityId): number {
  if (commodityId === 'electronics' || commodityId === 'machinery') {
    return PORT_YARD_HOLD_USD_PER_KG_DAY * PORT_YARD_HOLD_VALUE_MULT;
  }
  return PORT_YARD_HOLD_USD_PER_KG_DAY;
}

/** Public rate ($/kg/economy-day) for yard hold UI + quotes. */
export function portYardHoldUsdPerKgDay(commodityId: CommodityId): number {
  return yardHoldUsdPerKgDay(commodityId);
}

/** Daily yard hold charge for a pickup lot at current mass. */
export function portYardHoldUsdPerDay(opts: {
  kg: number;
  commodityId: CommodityId;
  hubIcao?: string;
  state?: Pick<CareerMissionsState, 'groundStaff' | 'playerWarehouses'>;
}): number {
  const kg = Math.max(0, opts.kg);
  if (kg <= 0) return 0;
  const mult =
    opts.state && opts.hubIcao
      ? yardHoldMultForHub(opts.state, opts.hubIcao)
      : 1;
  return money(kg * yardHoldUsdPerKgDay(opts.commodityId) * mult);
}

/** Whole economy days a yard lot has been sitting (purchase day → now). */
export function portYardHeldDays(
  purchasedAtTick: number,
  currentTick: number,
): number {
  return Math.max(
    0,
    economyDayIndex(currentTick) - economyDayIndex(purchasedAtTick),
  );
}

export type PortYardHoldSettleResult = {
  debitUsd: number;
  requestedUsd: number;
  shortfallUsd: number;
  daysCharged: number;
};

/** Daily fee for cargo sitting in port pickups (yard), by economy day. */
export function settlePortYardHoldFees(
  state: CareerMissionsState,
  opts: { fromTick: number; toTick: number },
): PortYardHoldSettleResult {
  const daysCharged = Math.max(
    0,
    economyDayIndex(opts.toTick) - economyDayIndex(opts.fromTick),
  );
  const empty: PortYardHoldSettleResult = {
    debitUsd: 0,
    requestedUsd: 0,
    shortfallUsd: 0,
    daysCharged: 0,
  };
  if (daysCharged <= 0) return empty;
  const pickups = ensurePlayerPortPickups(state);
  if (pickups.length === 0) return { ...empty, daysCharged };

  let requestedUsd = 0;
  for (const pickup of pickups) {
    const mult = yardHoldMultForHub(state, pickup.hubIcao);
    requestedUsd +=
      pickup.kg *
      yardHoldUsdPerKgDay(pickup.commodityId) *
      mult *
      daysCharged;
  }
  requestedUsd = money(requestedUsd);
  if (requestedUsd <= 0) return { ...empty, daysCharged };

  const debitUsd = money(Math.min(state.walletUsd, requestedUsd));
  const shortfallUsd = money(Math.max(0, requestedUsd - debitUsd));
  if (debitUsd > 0) {
    applyWalletDelta(state, {
      amountUsd: -debitUsd,
      kind: 'port_yard_hold',
      atTick: opts.toTick,
      note: `Yard hold ${daysCharged}d · ${pickups.length} lot(s) · $${requestedUsd.toFixed(2)} due`,
    });
  }
  return { debitUsd, requestedUsd, shortfallUsd, daysCharged };
}

/**
 * @deprecated FBO spot removed — use depositPortPickupToWarehouse.
 */
export function depositPortPickupToFboSpot(
  state: CareerMissionsState,
  world: CareerEconomyWorld,
  opts: { pickupId: string },
): ReturnType<typeof depositPortPickupToWarehouse> {
  return depositPortPickupToWarehouse(state, world, opts);
}

/**
 * @deprecated Fly-to-FBO-spot removed — fulfill Demand Board orders instead.
 */
export function stagePortPickupToFbo(
  _state: CareerMissionsState,
  _world: CareerEconomyWorld,
  _opts: { pickupId: string; destIcao: string; aircraftId: string },
): never {
  throw new Error(
    'Fly to FBO for spot removed — store in Warehouse and accept a Demand Board order',
  );
}

/** Restore a cancelled port-reposition mission back onto the pickup list. */
export function restorePortPickupFromMission(
  state: CareerMissionsState,
  mission: {
    portPickupId?: string;
    portId?: string;
    originIcao: string;
    commodityId: CommodityId;
    cargoKg: number;
    portAvgCostUsdPerKg?: number;
    acceptedAtTick?: number;
    lots?: Array<{ cargoKg: number; commodityId: CommodityId }>;
  },
): PlayerPortPickup | null {
  const id = mission.portPickupId?.trim();
  if (!id) return null;
  const pickups = ensurePlayerPortPickups(state);
  if (pickups.some((p) => p.id === id)) return null;

  const line = mission.lots?.[0];
  const kg = line?.cargoKg ?? mission.cargoKg ?? 0;
  if (kg <= 0) return null;

  const restored: PlayerPortPickup = {
    id,
    portId: (mission.portId ?? 'UNKNOWN').trim().toUpperCase(),
    hubIcao: mission.originIcao.trim().toUpperCase(),
    commodityId: (line?.commodityId ?? mission.commodityId) as CommodityId,
    kg,
    avgCostUsdPerKg: mission.portAvgCostUsdPerKg ?? 0,
    purchasedAtTick: mission.acceptedAtTick ?? 0,
  };
  pickups.push(restored);
  return restored;
}

/** Hub spot price for UI contrast (null if hub/commodity missing). */
export function hubSpotUnitPriceUsd(
  world: CareerEconomyWorld,
  hubIcao: string,
  commodityId: CommodityId,
): number | null {
  const ap = airportByIcao(world, hubIcao);
  const pile = ap?.inventory[commodityId];
  if (!pile) return null;
  return money(localUnitPriceUsd(commodityId, pile));
}

export function portSnapshot(
  world: CareerEconomyWorld,
  state?: CareerMissionsState,
): {
  ports: Array<
    CareerPortDef & {
      pickupHubDetails: Array<{
        icao: string;
        lat: number;
        lon: number;
        name?: string;
      }>;
      listings: Array<
        PortListing & {
          commodityName: string;
          hubSpotUnitPriceUsd: number | null;
        }
      >;
      inventory: Array<{
        commodityId: CommodityId;
        commodityName: string;
        stockKg: number;
        capKg: number;
      }>;
      concession: {
        status: 'vacant' | 'yours' | 'held';
        companyId: string | null;
        leasePaidThroughTick: number | null;
        lifetimeThroughputKg: number | null;
        claim: ReturnType<typeof evaluatePortConcessionClaim> | null;
      };
    }
  >;
  pickups: Array<
    PlayerPortPickup & {
      commodityName: string;
      holdUsdPerDay: number;
      heldDays: number;
    }
  >;
  /** Sum of daily yard hold fees across all pickups. */
  yardHoldUsdPerDay: number;
  /** Economy tick at snapshot time (for inbound ETA). */
  tick: number;
  warehouses: ReturnType<typeof playerWarehouseSnapshot>;
  demand: ReturnType<typeof demandSnapshot>;
  ownedFbos: Array<{
    id: string;
    icao: string;
    lat: number;
    lon: number;
    name?: string;
    tier: number;
  }>;
  concessions: NonNullable<CareerMissionsState['playerPortConcessions']>;
} {
  if (state) {
    tickPortConcessions(state, world);
    syncWorldPortConcessions(world, state);
  }
  ensurePortListings(world);
  ensureDemandOrders(world);
  const pickups = state ? ensurePlayerPortPickups(state) : [];
  const pickupViews = pickups.map((p) => {
    const holdUsdPerDay = portYardHoldUsdPerDay({
      kg: p.kg,
      commodityId: p.commodityId,
      hubIcao: p.hubIcao,
      state: state ?? undefined,
    });
    return {
      ...p,
      commodityName: getCommodity(p.commodityId).name,
      holdUsdPerDay,
      heldDays: portYardHeldDays(p.purchasedAtTick, world.tick),
    };
  });
  const yardHoldUsdPerDay = money(
    pickupViews.reduce((sum, p) => sum + p.holdUsdPerDay, 0),
  );
  const warehouses = state
    ? playerWarehouseSnapshot(state, world)
    : {
        warehouses: [],
        stock: [],
        inboundTransfers: [],
        pickupHubs: [],
        buyUsdByIcao: {},
      };
  const demand = demandSnapshot(world, {
    warehouseIcaos: warehouses.warehouses.map((w) => w.icao),
  });
  const ownedFbos = state
    ? ensurePlayerFbos(state).fbos.flatMap((fbo) => {
        const icao = fbo.icao.trim().toUpperCase();
        const coords = CAREER_HUB_COORDS[icao];
        const ap = airportByIcao(world, icao);
        const lat = coords?.lat ?? ap?.lat;
        const lon = coords?.lon ?? ap?.lon;
        if (lat == null || lon == null) return [];
        return [
          {
            id: fbo.id,
            icao,
            lat,
            lon,
            name: coords?.name ?? ap?.name,
            tier: fbo.tier,
          },
        ];
      })
    : [];
  return {
    ports: CAREER_PORTS.map((port) => {
      const op = findActivePortOperator(world, port.id);
      const yours = Boolean(
        state && op && op.companyId === LOCAL_COMPANY_ID,
      );
      const yoursConc = state?.playerPortConcessions?.find(
        (c) => c.portId === port.id && c.companyId === LOCAL_COMPANY_ID,
      );
      return {
        ...port,
        pickupHubs: [...port.pickupHubs],
        pickupHubDetails: port.pickupHubs.map((icao) => {
          const coords = CAREER_HUB_COORDS[icao];
          const ap = airportByIcao(world, icao);
          return {
            icao,
            lat: coords?.lat ?? ap?.lat ?? port.lat,
            lon: coords?.lon ?? ap?.lon ?? port.lon,
            name: coords?.name ?? ap?.name,
          };
        }),
        listings: listPortListings(world, port.id).map((l) => ({
          ...l,
          commodityName: getCommodity(l.commodityId).name,
          hubSpotUnitPriceUsd: hubSpotUnitPriceUsd(
            world,
            l.allocatedHubIcao,
            l.commodityId,
          ),
        })),
        inventory: portInventorySnapshot(world, port.id).map((row) => ({
          ...row,
          commodityName: getCommodity(row.commodityId).name,
        })),
        concession: {
          status: yours ? 'yours' : op ? 'held' : 'vacant',
          companyId: op?.companyId ?? null,
          leasePaidThroughTick: op?.leasePaidThroughTick ?? null,
          lifetimeThroughputKg: yoursConc?.lifetimeThroughputKg ?? null,
          claim: state
            ? evaluatePortConcessionClaim(state, world, port.id)
            : null,
        },
      };
    }),
    pickups: pickupViews,
    yardHoldUsdPerDay,
    tick: world.tick,
    warehouses,
    demand,
    ownedFbos,
    concessions: state?.playerPortConcessions ?? [],
  };
}
