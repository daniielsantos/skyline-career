/**
 * Generate Wave B / D / polish densify catalogs toward ~2000 hubs.
 * Usage: node scripts/gen-wave-b-d-densify.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'packages', 'shared', 'src');

const BIASES = {
  drySpoke: {
    produce: { general: 1.1, supplies: 1.0, perishables: 1.05 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  industrial: {
    produce: { machinery: 1.25, electronics: 1.15, general: 1.15 },
    consume: { perishables: 1.05, supplies: 1.0 },
  },
  agro: {
    produce: { perishables: 1.25, general: 1.1, supplies: 1.0 },
    consume: { electronics: 0.9, machinery: 0.85 },
  },
  city: {
    produce: { general: 1.2, electronics: 1.1, supplies: 1.0 },
    consume: { perishables: 1.1, general: 1.0, machinery: 0.9 },
  },
  tourism: {
    produce: { perishables: 1.15, general: 1.1, supplies: 1.05 },
    consume: { electronics: 1.0, machinery: 0.85 },
  },
};

/** Existing densify countries — append only (Americas + EU-1 West). */
const APPEND_CODES = new Set([
  'pt', 'es', 'fr', 'gb', 'de', 'nl', 'it', 'be',
  'ar', 'cl', 'pe', 'bo', 'ec', 'co', 've', 'gy', 'sr', 'gf',
  'pa', 'cr', 'ni', 'hn', 'gt', 'bz', 'cu', 'do', 'ht', 'jm', 'bs', 'gp', 'gd',
  'ca', 'mx', 'us', 'br',
]);

/** ICAOs blocked by catalog asserts — never densify these. */
const FORBIDDEN = new Set([
  'VOGA', 'VIDD', 'VOBG', 'VOHY', 'VOML',
  'ZUTF', 'ZBTJ', 'ZLSN', 'ZBAD',
  'RJGG', 'RJOO', 'RJNN', 'ROAH',
  'YSBK', 'YMEN', 'YMAV',
  'WIMK', 'WRRR', 'WIDD', 'WAJJ', 'WAMM',
  'WARS', 'WAHS', 'WAHI', 'WARQ', 'WAJW', 'WIPT', 'WAMP', 'WIKN', 'WAML', 'WALR', 'WIPB', 'WIPK',
  'RPML', 'RPLB', 'RPVP', 'RPSP',
  'VOGA', 'VIDD', 'VOBG', 'VOHY', 'VOML', 'VOTR',
  'ZUTF', 'ZBTJ', 'ZLSN', 'ZBAD',
  'RJGG', 'RJOO', 'RJNN', 'ROAH',
  'YSBK', 'YMEN', 'YMAV',
  'RKSS', 'RKJB',
  'RCQC',
  'NZQN', 'NZDN',
  'GOBD', 'FADN', 'FNUB', 'HSSJ', 'HSSS', 'HLLT', 'UTBK', 'URRR',
  'GOTB', 'FALA', 'FAGM',
  'FLHN', 'GOSM', 'LBHT', 'LBHS',
]);

/**
 * @typedef {'wave-b-eu' | 'wave-b-asia' | 'wave-d' | 'polish'} Phase
 * @typedef {{ icao: string, name: string, region: string, hubTier: string, lat: number, lon: number, kind?: string, phase?: Phase }} Hub
 * @typedef {{ regionType: string, countryName: string, hubs: Hub[] }} Pack
 */

/** @type {Record<string, Pack>} */
const EXISTING_EU_PACKS = {
  // ── Wave B EU-2 ──
  ie: {
    regionType: 'IeCareerRegion',
    countryName: 'Ireland',
    hubs: [
      h('EIDL', 'Donegal', 'IE-W', 'spoke', 55.0442, -8.34111, 'agro'),
      h('EIKY', 'Kerry', 'IE-W', 'spoke', 52.1809, -9.52378, 'tourism'),
      h('EICA', 'Connemara', 'IE-W', 'spoke', 53.2303, -9.46778, 'tourism'),
    ],
  },
  dk: {
    regionType: 'DkCareerRegion',
    countryName: 'Denmark',
    hubs: [
      h('EKOD', 'Odense Hans Christian Andersen', 'DK-W', 'spoke', 55.4767, 10.3309, 'city'),
      h('EKSB', 'Sonderborg', 'DK-W', 'spoke', 54.9644, 9.79173, 'agro'),
      h('EKEB', 'Esbjerg', 'DK-W', 'spoke', 55.5259, 8.5534, 'industrial'),
    ],
  },
  no: {
    regionType: 'NoCareerRegion',
    countryName: 'Norway',
    hubs: [
      h('ENBO', 'Bodo', 'NO-N', 'regional', 67.2692, 14.3653, 'city'),
      h('ENML', 'Molde Aro', 'NO-S', 'spoke', 62.7447, 7.2625, 'tourism'),
      h('ENHD', 'Haugesund Karmoy', 'NO-S', 'spoke', 59.3453, 5.20836, 'industrial'),
      h('ENKB', 'Kristiansund Kvernberget', 'NO-S', 'spoke', 63.1118, 7.82452, 'agro'),
    ],
  },
  se: {
    regionType: 'SeCareerRegion',
    countryName: 'Sweden',
    hubs: [
      h('ESMS', 'Malmo Sturup', 'SE-S', 'regional', 55.5363, 13.3762, 'city'),
      h('ESSV', 'Visby', 'SE-S', 'spoke', 57.6628, 18.3462, 'tourism'),
      h('ESNN', 'Sundsvall Timra', 'SE-N', 'spoke', 62.5281, 17.4439, 'industrial'),
      h('ESOE', 'Orebro', 'SE-S', 'spoke', 59.2237, 15.038, 'city'),
    ],
  },
  fi: {
    regionType: 'FiCareerRegion',
    countryName: 'Finland',
    hubs: [
      h('EFOU', 'Oulu', 'FI-N', 'regional', 64.9301, 25.3546, 'industrial'),
      h('EFIV', 'Ivalo', 'FI-N', 'spoke', 68.6073, 27.4053, 'tourism'),
      h('EFJO', 'Joensuu', 'FI-S', 'spoke', 62.6629, 29.6075, 'agro'),
    ],
  },
  ch: {
    regionType: 'ChCareerRegion',
    countryName: 'Switzerland',
    hubs: [
      h('LSZS', 'Samedan Engadin', 'CH-C', 'spoke', 46.5341, 9.88411, 'tourism'),
      h('LSZG', 'Grenchen', 'CH-C', 'spoke', 47.1816, 7.41719, 'industrial'),
    ],
  },
  at: {
    regionType: 'AtCareerRegion',
    countryName: 'Austria',
    hubs: [
      h('LOAN', 'Wiener Neustadt Ost', 'AT-E', 'spoke', 47.8433, 16.2602, 'industrial'),
      h('LOIJ', 'St Johann in Tirol', 'AT-W', 'spoke', 47.5201, 12.4508, 'tourism'),
      h('LOXZ', 'Zeltweg', 'AT-E', 'spoke', 47.2033, 14.745, 'industrial'),
    ],
  },
  // ── Wave B EU-3 ──
  pl: {
    regionType: 'PlCareerRegion',
    countryName: 'Poland',
    hubs: [
      h('EPMO', 'Warsaw Modlin', 'PL-C', 'regional', 52.4511, 20.6518, 'city'),
      h('EPZG', 'Zielona Gora Babimost', 'PL-N', 'spoke', 52.1385, 15.7986, 'agro'),
      h('EPSY', 'Olsztyn Mazury', 'PL-N', 'spoke', 53.4819, 20.9378, 'tourism'),
      h('EPRA', 'Radom', 'PL-C', 'spoke', 51.3892, 21.2136, 'industrial'),
    ],
  },
  cz: {
    regionType: 'CzCareerRegion',
    countryName: 'Czechia',
    hubs: [
      h('LKCS', 'Ceske Budejovice', 'CZ-W', 'spoke', 48.9464, 14.4275, 'agro'),
      h('LKKU', 'Kunovice', 'CZ-E', 'spoke', 49.0294, 17.4397, 'industrial'),
      h('LKVO', 'Vodochody', 'CZ-W', 'spoke', 50.2166, 14.3958, 'industrial'),
    ],
  },
  sk: {
    regionType: 'SkCareerRegion',
    countryName: 'Slovakia',
    hubs: [
      h('LZZI', 'Zilina', 'SK-C', 'spoke', 49.2315, 18.6135, 'industrial'),
      h('LZSL', 'Sliac', 'SK-C', 'spoke', 48.6378, 19.1342, 'agro'),
    ],
  },
  hu: {
    regionType: 'HuCareerRegion',
    countryName: 'Hungary',
    hubs: [
      h('LHKE', 'Kecskemet', 'HU-C', 'spoke', 46.9175, 19.7492, 'industrial'),
      h('LHBC', 'Bekescsaba', 'HU-C', 'spoke', 46.6853, 21.1591, 'agro'),
      h('LHBS', 'Budaors', 'HU-C', 'spoke', 47.4511, 18.9875, 'city'),
    ],
  },
  ee: {
    regionType: 'EeCareerRegion',
    countryName: 'Estonia',
    hubs: [
      h('EEKE', 'Kuressaare', 'EE-C', 'spoke', 58.2299, 22.5094, 'tourism'),
      h('EEEI', 'Amari', 'EE-C', 'spoke', 59.2603, 24.2085, 'industrial'),
    ],
  },
  lv: {
    regionType: 'LvCareerRegion',
    countryName: 'Latvia',
    hubs: [
      h('EVRS', 'Riga Spilve', 'LV-C', 'spoke', 56.9917, 24.0781, 'city'),
      h('EVDA', 'Daugavpils', 'LV-C', 'spoke', 55.9447, 26.665, 'agro'),
    ],
  },
  lt: {
    regionType: 'LtCareerRegion',
    countryName: 'Lithuania',
    hubs: [
      h('EYPN', 'Panevezys', 'LT-C', 'spoke', 55.7333, 24.45, 'agro'),
      h('EYPR', 'Prienai', 'LT-C', 'spoke', 54.6531, 24.0122, 'agro'),
    ],
  },
  // ── Wave B EU-4 ──
  hr: {
    regionType: 'HrCareerRegion',
    countryName: 'Croatia',
    hubs: [
      h('LDRI', 'Rijeka', 'HR-N', 'spoke', 45.2169, 14.5703, 'tourism'),
      h('LDLO', 'Losinj', 'HR-S', 'spoke', 44.5657, 14.3931, 'tourism'),
      h('LDOS', 'Osijek', 'HR-N', 'spoke', 45.4627, 18.8102, 'agro'),
    ],
  },
  si: {
    regionType: 'SiCareerRegion',
    countryName: 'Slovenia',
    hubs: [
      h('LJPZ', 'Portoroz', 'SI-C', 'spoke', 45.4734, 13.615, 'tourism'),
      h('LJCE', 'Cerklje ob Krki', 'SI-C', 'spoke', 45.9, 15.5302, 'industrial'),
    ],
  },
  ro: {
    regionType: 'RoCareerRegion',
    countryName: 'Romania',
    hubs: [
      h('LRCK', 'Constanta Mihail Kogalniceanu', 'RO-E', 'regional', 44.3622, 28.4883, 'industrial'),
      h('LRBV', 'Brasov Ghimbav', 'RO-W', 'spoke', 45.7019, 25.5211, 'tourism'),
      h('LRBS', 'Bucharest Baneasa', 'RO-E', 'spoke', 44.5032, 26.1021, 'city'),
      h('LRTC', 'Tulcea', 'RO-E', 'spoke', 45.0625, 28.7143, 'agro'),
    ],
  },
  bg: {
    regionType: 'BgCareerRegion',
    countryName: 'Bulgaria',
    hubs: [
      h('LBGO', 'Gorna Oryahovitsa', 'BG-C', 'spoke', 43.1514, 25.7129, 'agro'),
      h('LBHT', 'Haskovo Malevo', 'BG-C', 'spoke', 41.8714, 25.6048, 'agro'),
    ],
  },
  gr: {
    regionType: 'GrCareerRegion',
    countryName: 'Greece',
    hubs: [
      h('LGKL', 'Kalamata', 'GR-S', 'spoke', 37.0683, 22.0255, 'tourism'),
      h('LGLM', 'Limnos', 'GR-N', 'spoke', 39.9171, 25.2363, 'tourism'),
      h('LGZA', 'Zakinthos', 'GR-S', 'spoke', 37.7509, 20.8843, 'tourism'),
      h('LGKF', 'Kefallinia', 'GR-S', 'spoke', 38.1201, 20.5005, 'tourism'),
      h('LGSK', 'Skiathos', 'GR-N', 'spoke', 39.1771, 23.5037, 'tourism'),
    ],
  },
  rs: {
    regionType: 'RsCareerRegion',
    countryName: 'Serbia',
    hubs: [
      h('LYBT', 'Batajnica', 'RS-C', 'spoke', 44.9353, 20.2575, 'industrial'),
      h('LYUZ', 'Uzice Ponikve', 'RS-C', 'spoke', 43.8989, 19.6977, 'tourism'),
    ],
  },
  // ── Wave B EU-1 light gaps (append) ──
  pt: {
    regionType: 'PtCareerRegion',
    countryName: 'Portugal',
    hubs: [h('LPEV', 'Evora', 'PT-S', 'spoke', 38.5335, -7.88964, 'agro')],
  },
  es: {
    regionType: 'EsCareerRegion',
    countryName: 'Spain',
    hubs: [h('LEAM', 'Almeria', 'ES-S', 'spoke', 36.8439, -2.3701, 'tourism')],
  },
  fr: {
    regionType: 'FrCareerRegion',
    countryName: 'France',
    hubs: [h('LFRN', 'Rennes St Jacques', 'FR-W', 'spoke', 48.0695, -1.73479, 'city')],
  },
  gb: {
    regionType: 'GbCareerRegion',
    countryName: 'United Kingdom',
    hubs: [h('EGHI', 'Southampton', 'GB-S', 'spoke', 50.9503, -1.3568, 'city')],
  },
  de: {
    regionType: 'DeCareerRegion',
    countryName: 'Germany',
    hubs: [h('EDJA', 'Memmingen', 'DE-S', 'spoke', 47.9888, 10.2395, 'industrial')],
  },
  nl: {
    regionType: 'NlCareerRegion',
    countryName: 'Netherlands',
    hubs: [h('EHEH', 'Eindhoven', 'NL-C', 'regional', 51.4501, 5.37453, 'industrial')],
  },
  it: {
    regionType: 'ItCareerRegion',
    countryName: 'Italy',
    hubs: [h('LIPX', 'Verona Villafranca', 'IT-N', 'spoke', 45.3957, 10.8885, 'tourism')],
  },
};

/** Generated from curated, scheduled-service OurAirports rows. */
const EXPANSION_PACKS = {
  cn: {
    regionType: 'CnCareerRegion',
    countryName: "China",
    hubs: [
      h('ZBOW', "Baotou Donghe International Airport", 'CN-N', 'regional', 40.56, 109.997, 'city', 'wave-b-asia'),
      h('ZSYT', "Yantai Penglai International Airport", 'CN-E', 'regional', 37.6572, 120.9872, 'city', 'wave-b-asia'),
      h('ZBDT', "Datong Yungang International Airport", 'CN-N', 'regional', 40.06139, 113.48051, 'city', 'wave-b-asia'),
      h('ZLDH', "Dunhuang Mogao International Airport", 'CN-N', 'regional', 40.16195, 94.81283, 'city', 'wave-b-asia'),
      h('ZHEC', "Ezhou Huahu International Airport", 'CN-E', 'regional', 30.34118, 115.03926, 'city', 'wave-b-asia'),
      h('ZGKL', "Guilin Liangjiang International Airport", 'CN-W', 'regional', 25.21983, 110.03955, 'city', 'wave-b-asia'),
      h('ZSOF', "Hefei Xinqiao International Airport", 'CN-E', 'regional', 31.98779, 116.9769, 'city', 'wave-b-asia'),
      h('ZSSH', "Huai'an Lianshui Airport", 'CN-E', 'regional', 33.79271, 119.12666, 'city', 'wave-b-asia'),
      h('ZSTX', "Huangshan Tunxi International Airport", 'CN-E', 'regional', 29.7333, 118.256, 'city', 'wave-b-asia'),
      h('ZBLA', "Hulunbuir Hailar Airport", 'CN-N', 'regional', 49.20862, 119.8223, 'city', 'wave-b-asia'),
      h('ZLJQ', "Jiayuguan International Airport", 'CN-N', 'regional', 39.85905, 98.33934, 'city', 'wave-b-asia'),
      h('ZGOW', "Jieyang Chaoshan International Airport", 'CN-S', 'regional', 23.552, 116.5033, 'city', 'wave-b-asia'),
      h('ZSJN', "Jinan Yaoqiang International Airport", 'CN-E', 'regional', 36.8572, 117.216, 'city', 'wave-b-asia'),
      h('ZWSH', "Kashgar Laining International Airport", 'CN-N', 'regional', 39.54227, 76.02023, 'city', 'wave-b-asia'),
      h('ZULS', "Lhasa Gonggar International Airport", 'CN-W', 'regional', 29.298, 90.91195, 'city', 'wave-b-asia'),
      h('ZSLG', "Lianyungang Huaguoshan International Airport", 'CN-E', 'regional', 34.41406, 119.17899, 'city', 'wave-b-asia'),
      h('ZPLJ', "Lijiang Sanyi International Airport", 'CN-W', 'regional', 26.67748, 100.24494, 'city', 'polish'),
      h('ZHLY', "Luoyang Beijiao Airport", 'CN-E', 'regional', 34.7411, 112.388, 'city', 'polish'),
      h('ZSCN', "Nanchang Changbei International Airport", 'CN-E', 'regional', 28.86482, 115.90271, 'city', 'polish'),
      h('ZBDS', "Ordos Ejin Horo International Airport", 'CN-N', 'regional', 39.49351, 109.8599, 'city', 'polish'),
      h('ZYQQ', "Qiqihar Sanjiazi Airport", 'CN-N', 'regional', 47.22997, 123.91418, 'city', 'polish'),
      h('ZSQZ', "Quanzhou Jinjiang International Airport", 'CN-S', 'regional', 24.79585, 118.5886, 'city', 'polish'),
    ],
  },
  in: {
    regionType: 'InCareerRegion',
    countryName: "India",
    hubs: [
      h('VOVI', "Alluri Sitarama Raju International Airport (Vizag)", 'IN-W', 'regional', 17.97151, 83.50362, 'city', 'wave-b-asia'),
      h('VEBD', "Bagdogra Airport", 'IN-E', 'regional', 26.6812, 88.3286, 'city', 'wave-b-asia'),
      h('VEIM', "Bir Tikendrajit International Airport", 'IN-W', 'regional', 24.76, 93.8967, 'city', 'wave-b-asia'),
      h('VOCL', "Calicut International Airport", 'IN-S', 'regional', 11.136, 75.95515, 'city', 'wave-b-asia'),
      h('VILK', "Chaudhary Charan Singh International Airport", 'IN-N', 'regional', 26.7606, 80.8893, 'city', 'wave-b-asia'),
      h('VOCB', "Coimbatore International Airport", 'IN-S', 'regional', 11.03, 77.0434, 'city', 'wave-b-asia'),
      h('VAID', "Devi Ahilya Bai Holkar International Airport", 'IN-W', 'regional', 22.7214, 75.80051, 'city', 'wave-b-asia'),
      h('VANP', "Dr. Babasaheb Ambedkar International Airport", 'IN-W', 'regional', 21.0922, 79.0472, 'city', 'wave-b-asia'),
      h('VIHX', "Halwara International Airport", 'IN-N', 'regional', 30.7485, 75.6298, 'city', 'wave-b-asia'),
      h('VOKN', "Kannur International Airport", 'IN-S', 'regional', 11.91634, 75.54498, 'city', 'wave-b-asia'),
      h('VEBN', "Lal Bahadur Shastri International Airport", 'IN-N', 'regional', 25.45217, 82.86255, 'city', 'wave-b-asia'),
      h('VIHR', "Maharaja Agrasen International Airport", 'IN-N', 'regional', 29.18606, 75.74142, 'city', 'wave-b-asia'),
      h('VOBZ', "Vijayawada International Airport", 'IN-S', 'regional', 16.5304, 80.7968, 'city', 'polish'),
      h('VOTR', "Tirupati Airport", 'IN-S', 'regional', 13.6325, 79.5433, 'city', 'polish'),
      h('VAOZ', "Nashik International Airport", 'IN-W', 'regional', 20.1191, 73.9129, 'city', 'polish'),
      h('VABP', "Raja Bhoj International Airport", 'IN-W', 'regional', 23.2875, 77.3374, 'city', 'polish'),
      h('VAHS', "Rajkot International Airport", 'IN-W', 'regional', 22.37882, 71.03939, 'city', 'polish'),
    ],
  },
  id: {
    regionType: 'IdCareerRegion',
    countryName: "Indonesia",
    hubs: [
      h('WARQ', "Adisoemarmo International Airport", 'ID-J', 'regional', -7.51604, 110.75749, 'city', 'wave-b-asia'),
      h('WAJW', "Wamena Airport", 'ID-U', 'regional', -4.10251, 138.957, 'drySpoke', 'wave-b-asia'),
      h('WIHH', "Halim Perdanakusuma International Airport", 'ID-J', 'regional', -6.26699, 106.89032, 'city', 'wave-b-asia'),
      h('WIKN', "Raja Haji Fisabilillah Airport", 'ID-S', 'regional', 0.92268, 104.532, 'drySpoke', 'wave-b-asia'),
      h('WARS', "Jenderal Ahmad Yani Airport", 'ID-J', 'regional', -6.97073, 110.37324, 'city', 'wave-b-asia'),
      h('WADL', "Lombok International Airport", 'ID-K', 'regional', -8.75996, 116.27817, 'city', 'wave-b-asia'),
      h('WIPT', "Minangkabau International Airport", 'ID-S', 'regional', -0.78596, 100.28038, 'city', 'wave-b-asia'),
      h('WAPP', "Pattimura International Airport", 'ID-U', 'regional', -3.71026, 128.089, 'city', 'wave-b-asia'),
      h('WAMP', "Mutiara SIS Al-Jufrie Airport", 'ID-K', 'regional', -0.91854, 119.90973, 'drySpoke', 'wave-b-asia'),
      h('WITT', "Sultan Iskandar Muda International Airport", 'ID-S', 'regional', 5.52509, 95.41997, 'city', 'polish'),
      h('WIOO', "Supadio International Airport", 'ID-J', 'regional', -0.15226, 109.40449, 'city', 'polish'),
      h('WAOO', "Syamsudin Noor International Airport", 'ID-J', 'regional', -3.44011, 114.76121, 'city', 'polish'),
      h('WAHI', "Yogyakarta International Airport", 'ID-J', 'regional', -7.90534, 110.05726, 'city', 'polish'),
    ],
  },
  jp: {
    regionType: 'JpCareerRegion',
    countryName: "Japan",
    hubs: [
      h('RJSA', "Aomori Airport", 'JP-N', 'regional', 40.73378, 140.68948, 'city', 'wave-b-asia'),
      h('RJFO', "Oita Airport", 'JP-W', 'regional', 33.4794, 131.737, 'city', 'wave-b-asia'),
      h('RJCH', "Hakodate Airport", 'JP-N', 'regional', 41.77, 140.82201, 'city', 'wave-b-asia'),
      h('RJOA', "Hiroshima Airport", 'JP-W', 'regional', 34.4361, 132.91901, 'city', 'wave-b-asia'),
      h('RJAH', "Ibaraki Airport", 'JP-E', 'regional', 36.18146, 140.41443, 'city', 'wave-b-asia'),
      h('RJFK', "Kagoshima Airport", 'JP-W', 'regional', 31.8034, 130.71899, 'city', 'wave-b-asia'),
      h('RJFR', "Kitakyushu Airport", 'JP-W', 'regional', 33.8459, 131.035, 'city', 'wave-b-asia'),
      h('RJBE', "Kobe Airport", 'JP-W', 'regional', 34.6328, 135.224, 'city', 'wave-b-asia'),
      h('RJOK', "Kochi Ryoma Airport", 'JP-W', 'regional', 33.54522, 133.67017, 'city', 'wave-b-asia'),
      h('RJNK', "Komatsu Airport / JASDF Komatsu Air Base", 'JP-W', 'regional', 36.39341, 136.40689, 'city', 'polish'),
      h('RJFT', "Kumamoto Airport", 'JP-W', 'regional', 32.8373, 130.855, 'city', 'polish'),
      h('RJFS', "Kyushu Saga International Airport", 'JP-W', 'regional', 33.1497, 130.302, 'city', 'polish'),
      h('RJOM', "Matsuyama Airport", 'JP-W', 'regional', 33.82689, 132.70011, 'city', 'polish'),
    ],
  },
  kr: {
    regionType: 'KrCareerRegion',
    countryName: "South Korea",
    hubs: [
      h('RKTU', "Cheongju International Airport/Cheongju Air Base (K-59/G-513)", 'KR-C', 'regional', 36.71556, 127.50029, 'city', 'wave-b-asia'),
      h('RKTN', "Daegu International Airport", 'KR-S', 'regional', 35.89439, 128.65699, 'city', 'wave-b-asia'),
      h('RKPU', "Ulsan Airport", 'KR-S', 'regional', 35.5935, 129.352, 'drySpoke', 'wave-b-asia'),
      h('RKJY', "Yeosu Airport", 'KR-S', 'regional', 34.8423, 127.617, 'drySpoke', 'wave-b-asia'),
      h('RKNY', "Yangyang International Airport", 'KR-C', 'regional', 38.06048, 128.66982, 'city', 'wave-b-asia'),
      h('RKJK', "Gunsan Airport / Gunsan Air Base", 'KR-S', 'regional', 35.9038, 126.616, 'drySpoke', 'wave-b-asia'),
      h('RKJJ', "Gwangju Airport", 'KR-S', 'regional', 35.12317, 126.80544, 'drySpoke', 'polish'),
      h('RKTH', "Pohang Airport (G-815/K-3)", 'KR-S', 'regional', 35.98795, 129.42038, 'drySpoke', 'polish'),
      h('RKPS', "Sacheon Airport / Sacheon Air Base", 'KR-S', 'regional', 35.08859, 128.07175, 'drySpoke', 'polish'),
    ],
  },
  th: {
    regionType: 'ThCareerRegion',
    countryName: "Thailand",
    hubs: [
      h('VTSG', "Krabi International Airport", 'TH-S', 'regional', 8.09559, 98.98896, 'city', 'wave-b-asia'),
      h('VTSM', "Samui International Airport", 'TH-S', 'regional', 9.54779, 100.062, 'city', 'wave-b-asia'),
      h('VTUD', "Udon Thani International Airport", 'TH-N', 'regional', 17.38619, 102.78858, 'city', 'wave-b-asia'),
      h('VTUO', "Buri Ram Airport", 'TH-C', 'regional', 15.2295, 103.253, 'drySpoke', 'wave-b-asia'),
      h('VTSE', "Chumphon Airport", 'TH-S', 'regional', 10.7112, 99.3617, 'drySpoke', 'wave-b-asia'),
      h('VTPH', "Hua Hin Airport", 'TH-C', 'regional', 12.6362, 99.9515, 'drySpoke', 'wave-b-asia'),
      h('VTCL', "Lampang Airport", 'TH-N', 'regional', 18.2709, 99.5042, 'drySpoke', 'wave-b-asia'),
      h('VTUL', "Loei Airport", 'TH-N', 'regional', 17.4391, 101.722, 'drySpoke', 'polish'),
      h('VTCH', "Mae Hong Son Airport", 'TH-N', 'regional', 19.3013, 97.9758, 'drySpoke', 'polish'),
      h('VTPM', "Mae Sot Airport", 'TH-C', 'regional', 16.6999, 98.5451, 'drySpoke', 'polish'),
    ],
  },
  vn: {
    regionType: 'VnCareerRegion',
    countryName: "Vietnam",
    hubs: [
      h('VVCR', "Cam Ranh International Airport / Cam Ranh Air Base", 'VN-S', 'regional', 11.9982, 109.219, 'city', 'wave-b-asia'),
      h('VVPQ', "Phú Quốc International Airport", 'VN-S', 'regional', 10.16978, 103.99353, 'city', 'wave-b-asia'),
      h('VVBM', "Buon Ma Thuot Airport", 'VN-S', 'regional', 12.6683, 108.12, 'drySpoke', 'wave-b-asia'),
      h('VVCM', "Cà Mau Airport", 'VN-S', 'regional', 9.17767, 105.17778, 'drySpoke', 'wave-b-asia'),
      h('VVCS', "Con Dao Airport", 'VN-S', 'regional', 8.73183, 106.633, 'drySpoke', 'wave-b-asia'),
      h('VVDB', "Dien Bien Phu Airport", 'VN-N', 'regional', 21.3975, 103.008, 'drySpoke', 'wave-b-asia'),
      h('VVDH', "Dong Hoi Airport", 'VN-N', 'regional', 17.515, 106.59056, 'drySpoke', 'polish'),
      h('VVTH', "Dong Tac Airport", 'VN-S', 'regional', 13.0496, 109.334, 'drySpoke', 'polish'),
    ],
  },
  my: {
    regionType: 'MyCareerRegion',
    countryName: "Malaysia",
    hubs: [
      h('WMKL', "Langkawi International Airport", 'MY-N', 'regional', 6.32973, 99.7287, 'city', 'wave-b-asia'),
      h('WMSA', "Sultan Abdul Aziz Shah International Airport", 'MY-C', 'regional', 3.13058, 101.549, 'city', 'wave-b-asia'),
      h('WBGZ', "Bario Airport", 'MY-K', 'regional', 3.73465, 115.47855, 'drySpoke', 'wave-b-asia'),
      h('WBGB', "Bintulu Airport", 'MY-K', 'regional', 3.12385, 113.02, 'drySpoke', 'wave-b-asia'),
      h('WMKD', "Kuantan Airport", 'MY-E', 'regional', 3.77539, 103.209, 'drySpoke', 'wave-b-asia'),
      h('WBKL', "Labuan Airport", 'MY-K', 'regional', 5.30167, 115.24833, 'drySpoke', 'wave-b-asia'),
      h('WBKD', "Lahad Datu Airport", 'MY-K', 'regional', 5.03241, 118.32376, 'drySpoke', 'polish'),
      h('WBGJ', "Limbang Airport", 'MY-K', 'regional', 4.8083, 115.01, 'drySpoke', 'polish'),
    ],
  },
  ph: {
    regionType: 'PhCareerRegion',
    countryName: "Philippines",
    hubs: [
      h('RPVB', "Bacolod-Silay International Airport", 'PH-V', 'regional', 10.77624, 123.01888, 'city', 'wave-b-asia'),
      h('RPLK', "Bicol International Airport", 'PH-L', 'regional', 13.11191, 123.67683, 'city', 'wave-b-asia'),
      h('RPSP', "Bohol-Panglao International Airport", 'PH-V', 'regional', 9.57305, 123.77014, 'city', 'wave-b-asia'),
      h('RPMR', "General Santos International Airport", 'PH-M', 'regional', 6.05721, 125.09624, 'city', 'wave-b-asia'),
      h('RPVI', "Iloilo International Airport", 'PH-V', 'regional', 10.83302, 122.49336, 'city', 'wave-b-asia'),
      h('RPVK', "Kalibo International Airport", 'PH-V', 'regional', 11.6794, 122.376, 'city', 'wave-b-asia'),
      h('RPLI', "Laoag International Airport", 'PH-L', 'regional', 18.17509, 120.53101, 'city', 'polish'),
      h('RPVE', "Kalibo International Airport", 'PH-V', 'regional', 11.6794, 122.376, 'city', 'polish'),
    ],
  },
  mm: {
    regionType: 'MmCareerRegion',
    countryName: "Myanmar",
    hubs: [
      h('VYDW', "Dawei Airport", 'MM-S', 'regional', 14.1039, 98.2036, 'drySpoke', 'wave-b-asia'),
      h('VYHH', "Heho Airport", 'MM-N', 'regional', 20.74714, 96.79203, 'drySpoke', 'wave-b-asia'),
      h('VYKT', "Kawthoung Airport", 'MM-S', 'regional', 10.0493, 98.538, 'drySpoke', 'wave-b-asia'),
      h('VYKG', "Kengtung Airport", 'MM-N', 'regional', 21.3016, 99.636, 'drySpoke', 'wave-b-asia'),
      h('VYKP', "Kyaukpyu Airport", 'MM-S', 'regional', 19.4264, 93.5348, 'drySpoke', 'polish'),
    ],
  },
  tw: {
    regionType: 'TwCareerRegion',
    countryName: "Taiwan",
    hubs: [
      h('RCYU', "Hualien Chiashan Airport", 'TW-N', 'regional', 24.02316, 121.61799, 'city', 'wave-b-asia'),
      h('RCWA', "Wang-an Airport", 'TW-C', 'spoke', 23.3674, 119.503, 'drySpoke', 'wave-b-asia'),
      h('RCKU', "Chiayi Airport", 'TW-C', 'regional', 23.46258, 120.39054, 'drySpoke', 'wave-b-asia'),
      h('RCBS', "Kinmen Airport", 'TW-N', 'regional', 24.4279, 118.359, 'drySpoke', 'wave-b-asia'),
      h('RCLY', "Lanyu Airport", 'TW-S', 'regional', 22.027, 121.535, 'drySpoke', 'polish'),
      h('RCMT', "Matsu Beigan Airport", 'TW-N', 'regional', 26.22414, 120.00268, 'drySpoke', 'polish'),
      h('RCFG', "Matsu Nangan Airport", 'TW-N', 'regional', 26.15966, 119.95838, 'drySpoke', 'polish'),
    ],
  },
  au: {
    regionType: 'AuCareerRegion',
    countryName: "Australia",
    hubs: [
      h('YBRM', "Broome International Airport", 'AU-W', 'regional', -17.94919, 122.2283, 'city', 'wave-d'),
      h('YBCG', "Gold Coast Airport", 'AU-Q', 'regional', -28.16596, 153.50664, 'city', 'wave-d'),
      h('YBHI', "Broken Hill Airport", 'AU-E', 'regional', -32.0014, 141.472, 'drySpoke', 'wave-d'),
      h('YWLM', "Newcastle Airport", 'AU-Q', 'regional', -32.79611, 151.83503, 'city', 'wave-d'),
      h('YPPD', "Port Hedland International Airport", 'AU-W', 'regional', -20.38279, 118.62979, 'city', 'wave-d'),
      h('YBSU', "Sunshine Coast Airport", 'AU-Q', 'regional', -26.59332, 153.08319, 'city', 'wave-d'),
      h('YBWW', "Toowoomba Wellcamp Airport", 'AU-Q', 'regional', -27.55833, 151.79334, 'city', 'wave-d'),
      h('YABA', "Albany Airport", 'AU-W', 'regional', -34.94333, 117.80889, 'drySpoke', 'wave-d'),
      h('YMAY', "Albury Airport", 'AU-Q', 'regional', -36.06676, 146.95915, 'drySpoke', 'wave-d'),
      h('YBAS', "Alice Springs Airport", 'AU-E', 'regional', -23.80659, 133.90343, 'drySpoke', 'wave-d'),
      h('YARM', "Armidale Airport", 'AU-Q', 'regional', -30.5281, 151.617, 'drySpoke', 'wave-d'),
      h('YAYE', "Ayers Rock Connellan Airport", 'AU-E', 'regional', -25.18591, 130.97703, 'drySpoke', 'wave-d'),
      h('YBNA', "Ballina Byron Gateway Airport", 'AU-Q', 'regional', -28.83324, 153.56147, 'drySpoke', 'wave-d'),
      h('YBAR', "Barcaldine Airport", 'AU-Q', 'regional', -23.56627, 145.30209, 'drySpoke', 'wave-d'),
      h('YBTH', "Bathurst Airport", 'AU-Q', 'regional', -33.40682, 149.65116, 'drySpoke', 'polish'),
      h('YBIE', "Bedourie Airport", 'AU-E', 'regional', -24.3461, 139.46001, 'drySpoke', 'polish'),
      h('YBDV', "Birdsville Airport", 'AU-E', 'regional', -25.8975, 139.34801, 'drySpoke', 'polish'),
      h('YBCK', "Blackall Airport", 'AU-Q', 'regional', -24.43168, 145.42972, 'drySpoke', 'polish'),
      h('YBOU', "Boulia Airport", 'AU-E', 'regional', -22.9133, 139.89999, 'drySpoke', 'polish'),
      h('YBKE', "Bourke Airport", 'AU-Q', 'regional', -30.0392, 145.952, 'drySpoke', 'polish'),
    ],
  },
  nz: {
    regionType: 'NzCareerRegion',
    countryName: "New Zealand",
    hubs: [
      h('NZRO', "Rotorua Airport", 'NZ-N', 'regional', -38.1092, 176.317, 'city', 'wave-d'),
      h('NZPM', "Palmerston North Airport", 'NZ-S', 'regional', -40.3206, 175.617, 'drySpoke', 'wave-d'),
      h('NZGS', "Gisborne Airport", 'NZ-N', 'regional', -38.6633, 177.978, 'drySpoke', 'wave-d'),
      h('NZHN', "Hamilton International Airport", 'NZ-N', 'regional', -37.86696, 175.33195, 'drySpoke', 'wave-d'),
      h('NZNR', "Hawke's Bay Airport", 'NZ-S', 'regional', -39.4658, 176.86999, 'drySpoke', 'wave-d'),
      h('NZHK', "Hokitika Airfield", 'NZ-S', 'regional', -42.7136, 170.985, 'drySpoke', 'wave-d'),
      h('NZCI', "Inia William Tuuta Memorial Airport", 'NZ-W', 'regional', -43.81189, -176.46514, 'drySpoke', 'wave-d'),
      h('NZNV', "Invercargill Airport", 'NZ-W', 'regional', -46.4124, 168.313, 'drySpoke', 'wave-d'),
      h('NZKT', "Kaitaia Airport", 'NZ-N', 'regional', -35.06984, 173.28705, 'drySpoke', 'polish'),
      h('NZKK', "Kerikeri Airport", 'NZ-N', 'regional', -35.25915, 173.91332, 'drySpoke', 'polish'),
      h('NZNS', "Nelson Airport", 'NZ-S', 'regional', -41.29671, 173.22432, 'drySpoke', 'polish'),
      h('NZNP', "New Plymouth Airport", 'NZ-S', 'regional', -39.0086, 174.179, 'drySpoke', 'polish'),
    ],
  },
  ng: {
    regionType: 'NgCareerRegion',
    countryName: "Nigeria",
    hubs: [
      h('DNEN', "Akanu Ibiam International Airport", 'NG-C', 'regional', 6.47372, 7.56046, 'city', 'wave-d'),
      h('DNAS', "Asaba International Airport", 'NG-SW', 'regional', 6.20417, 6.66528, 'city', 'wave-d'),
      h('DNIL', "General Tunde Idiagbon International Airport", 'NG-SW', 'regional', 8.44021, 4.49392, 'city', 'wave-d'),
      h('DNKA', "Kaduna International Airport", 'NG-N', 'regional', 10.696, 7.32011, 'city', 'polish'),
      h('DNMA', "Maiduguri International Airport", 'NG-N', 'regional', 11.85416, 13.0807, 'city', 'polish'),
    ],
  },
  za: {
    regionType: 'ZaCareerRegion',
    countryName: "South Africa",
    hubs: [
      h('FABL', "Bram Fischer International Airport", 'ZA-G', 'regional', -29.0927, 26.3024, 'city', 'wave-d'),
      h('FAPE', "Chief Dawid Stuurman International Airport", 'ZA-G', 'regional', -33.98971, 25.61735, 'city', 'wave-d'),
      h('FAGG', "George Airport", 'ZA-G', 'regional', -34.0056, 22.3789, 'city', 'wave-d'),
      h('FAKM', "Kimberley Airport", 'ZA-G', 'regional', -28.8054, 24.76487, 'city', 'wave-d'),
      h('FAEL', "King Phalo Airport", 'ZA-G', 'regional', -33.0356, 27.8259, 'city', 'polish'),
      h('FAKN', "Kruger Mpumalanga International Airport", 'ZA-E', 'regional', -25.38333, 31.10533, 'city', 'polish'),
      h('FALA', "Lanseria International Airport", 'ZA-G', 'regional', -25.93896, 27.92664, 'city', 'polish'),
    ],
  },
  ke: {
    regionType: 'KeCareerRegion',
    countryName: "Kenya",
    hubs: [
      h('HKEL', "Eldoret International Airport", 'KE-C', 'regional', 0.40446, 35.2389, 'city', 'wave-d'),
      h('HKKI', "Kisumu International Airport", 'KE-C', 'regional', -0.08614, 34.7289, 'city', 'wave-d'),
      h('HKAM', "Amboseli Airport", 'KE-C', 'regional', -2.64479, 37.25292, 'drySpoke', 'wave-d'),
      h('HKML', "Malindi International Airport", 'KE-E', 'regional', -3.22931, 40.1017, 'drySpoke', 'polish'),
      h('HKLU', "Manda Airport", 'KE-E', 'regional', -2.25243, 40.91289, 'drySpoke', 'polish'),
    ],
  },
  et: {
    regionType: 'EtCareerRegion',
    countryName: "Ethiopia",
    hubs: [
      h('HADR', "Aba Tenna Dejazmach Yilma International Airport", 'ET-C', 'regional', 9.62355, 41.85503, 'city', 'wave-d'),
      h('HAJJ', "Gerad Wilwal International Airport", 'ET-C', 'regional', 9.33191, 42.91181, 'city', 'wave-d'),
      h('HALA', "Hawassa International Airport", 'ET-C', 'regional', 7.10061, 38.39646, 'city', 'polish'),
      h('HAAM', "Arba Minch Airport", 'ET-C', 'regional', 6.03939, 37.5905, 'drySpoke', 'polish'),
    ],
  },
  tz: {
    regionType: 'TzCareerRegion',
    countryName: "Tanzania",
    hubs: [
      h('HTZA', "Abeid Amani Karume International Airport", 'TZ-E', 'regional', -6.22202, 39.2249, 'city', 'wave-d'),
      h('HTMW', "Mwanza International Airport", 'TZ-N', 'regional', -2.44656, 32.93605, 'city', 'wave-d'),
      h('HTAR', "Arusha Airport", 'TZ-N', 'regional', -3.36779, 36.6333, 'drySpoke', 'polish'),
      h('HTDO', "Dodoma Airport", 'TZ-E', 'regional', -6.17056, 35.75604, 'drySpoke', 'polish'),
    ],
  },
  gh: {
    regionType: 'GhCareerRegion',
    countryName: "Ghana",
    hubs: [
      h('DGLE', "Yakubu Tali International Airport", 'GH-C', 'regional', 9.55391, -0.86606, 'city', 'wave-d'),
      h('DGAH', "Ho Airport", 'GH-C', 'regional', 6.57969, 0.53255, 'drySpoke', 'wave-d'),
      h('DGSN', "Sunyani Airport", 'GH-C', 'regional', 7.36183, -2.32876, 'drySpoke', 'polish'),
      h('DGTK', "Takoradi Airport", 'GH-C', 'regional', 4.89606, -1.77476, 'drySpoke', 'polish'),
    ],
  },
  sn: {
    regionType: 'SnCareerRegion',
    countryName: "Senegal",
    hubs: [
      h('GOSM', "Saint-Louis Airport", 'SN-W', 'regional', 16.0508, -16.4632, 'drySpoke', 'wave-d'),
      h('GOGS', "Cap Skirring Airport", 'SN-W', 'regional', 12.39533, -16.748, 'drySpoke', 'wave-d'),
      h('GOGG', "Ziguinchor Airport", 'SN-W', 'regional', 12.55559, -16.2833, 'drySpoke', 'polish'),
      h('GOTB', "Bakel Airport", 'SN-E', 'regional', 14.8473, -12.4683, 'drySpoke', 'polish'),
    ],
  },
  ci: {
    regionType: 'CiCareerRegion',
    countryName: "Cote d'Ivoire",
    hubs: [
      h('DIBK', "Bouaké Airport", 'CI-S', 'regional', 7.7388, -5.07367, 'drySpoke', 'wave-d'),
      h('DIKO', "Korhogo Airport", 'CI-S', 'regional', 9.38718, -5.55666, 'drySpoke', 'wave-d'),
      h('DISP', "San Pedro Airport", 'CI-S', 'regional', 4.74672, -6.66082, 'drySpoke', 'polish'),
      h('DIYO', "Yamoussoukro International Airport", 'CI-S', 'regional', 6.90317, -5.36558, 'city', 'polish'),
    ],
  },
  ao: {
    regionType: 'AoCareerRegion',
    countryName: "Angola",
    hubs: [
      h('FNBJ', "Dr. Antonio Agostinho Neto International Airport", 'AO-N', 'regional', -9.05073, 13.49908, 'city', 'wave-d'),
      h('FNHU', "Albano Machado Airport", 'AO-N', 'regional', -12.8089, 15.7605, 'drySpoke', 'wave-d'),
      h('FNCA', "Cabinda Airport", 'AO-N', 'regional', -5.59839, 12.18815, 'drySpoke', 'wave-d'),
      h('FNCT', "Catumbela Airport", 'AO-N', 'regional', -12.4792, 13.4869, 'drySpoke', 'polish'),
    ],
  },
  cm: {
    regionType: 'CmCareerRegion',
    countryName: "Cameroon",
    hubs: [
      h('FKKR', "Garoua International Airport", 'CM-C', 'regional', 9.33479, 13.37213, 'city', 'wave-d'),
      h('FKKN', "N'Gaoundéré Airport", 'CM-C', 'regional', 7.35701, 13.5592, 'drySpoke', 'wave-d'),
      h('FKKL', "Salak Airport", 'CM-C', 'regional', 10.4514, 14.2574, 'drySpoke', 'polish'),
      h('FKKU', "Bafoussam Airport", 'CM-C', 'regional', 5.53692, 10.3546, 'drySpoke', 'polish'),
    ],
  },
  ug: {
    regionType: 'UgCareerRegion',
    countryName: "Uganda",
    hubs: [
      h('HUAR', "Arua Airport", 'UG-C', 'regional', 3.04915, 30.91171, 'drySpoke', 'wave-d'),
      h('HUGU', "Gulu Airport", 'UG-C', 'regional', 2.80556, 32.2718, 'drySpoke', 'wave-d'),
      h('HUSO', "Soroti Airport", 'UG-C', 'regional', 1.72769, 33.6228, 'drySpoke', 'polish'),
      h('HUAJ', "Adjumani Airport", 'UG-C', 'spoke', 3.33924, 31.76385, 'drySpoke', 'polish'),
    ],
  },
  rw: {
    regionType: 'RwCareerRegion',
    countryName: "Rwanda",
    hubs: [
      h('HRZA', "Kamembe Airport", 'RW-C', 'regional', -2.46224, 28.9079, 'drySpoke', 'wave-d'),
      h('HRYG', "Gisenyi Airport", 'RW-C', 'regional', -1.6772, 29.2589, 'drySpoke', 'polish'),
    ],
  },
  mz: {
    regionType: 'MzCareerRegion',
    countryName: "Mozambique",
    hubs: [
      h('FQNP', "Nampula Airport", 'MZ-C', 'regional', -15.1056, 39.2818, 'city', 'wave-d'),
      h('FQTT', "Tete Airport", 'MZ-C', 'regional', -16.1048, 33.6402, 'city', 'wave-d'),
      h('FQCH', "Chimoio Airport", 'MZ-C', 'regional', -19.1513, 33.429, 'drySpoke', 'wave-d'),
      h('FQIN', "Inhambane Airport", 'MZ-S', 'regional', -23.8764, 35.4085, 'drySpoke', 'polish'),
      h('FQLC', "Lichinga Airport", 'MZ-C', 'regional', -13.274, 35.2663, 'drySpoke', 'polish'),
    ],
  },
  na: {
    regionType: 'NaCareerRegion',
    countryName: "Namibia",
    hubs: [
      h('FYRU', "Rundu Airport", 'NA-C', 'regional', -17.9565, 19.7194, 'drySpoke', 'wave-d'),
      h('FYKM', "Katima Mulilo Airport", 'NA-C', 'regional', -17.63426, 24.17669, 'drySpoke', 'wave-d'),
      h('FYLZ', "Luderitz Airport", 'NA-C', 'regional', -26.6874, 15.2429, 'drySpoke', 'wave-d'),
      h('FYOA', "Ondangwa Airport", 'NA-C', 'regional', -17.8782, 15.9526, 'drySpoke', 'polish'),
    ],
  },
  bw: {
    regionType: 'BwCareerRegion',
    countryName: "Botswana",
    hubs: [
      h('FBKE', "Kasane International Airport", 'BW-C', 'regional', -17.83165, 25.16619, 'city', 'wave-d'),
      h('FBOR', "Orapa Airport", 'BW-C', 'spoke', -21.2667, 25.3167, 'drySpoke', 'wave-d'),
      h('FBFT', "Phillip Gaonwe Matante International Airport", 'BW-C', 'regional', -21.15918, 27.46883, 'city', 'polish'),
    ],
  },
  zm: {
    regionType: 'ZmCareerRegion',
    countryName: "Zambia",
    hubs: [
      h('FLLI', "Harry Mwanga Nkumbula International Airport", 'ZM-C', 'regional', -17.82152, 25.81964, 'city', 'wave-d'),
      h('FLHN', "Solwezi Airport", 'ZM-C', 'spoke', -12.1737, 26.3651, 'drySpoke', 'wave-d'),
      h('FLMF', "Mfuwe International Airport", 'ZM-C', 'regional', -13.2589, 31.9366, 'city', 'polish'),
    ],
  },
  zw: {
    regionType: 'ZwCareerRegion',
    countryName: "Zimbabwe",
    hubs: [
      h('FVFA', "Victoria Falls International Airport", 'ZW-C', 'regional', -18.09744, 25.83687, 'city', 'wave-d'),
      h('FVKB', "Kariba Airport", 'ZW-C', 'regional', -16.5198, 28.885, 'drySpoke', 'wave-d'),
      h('FVCZ', "Buffalo Range Airport", 'ZW-S', 'regional', -21.0081, 31.5786, 'drySpoke', 'polish'),
    ],
  },
  mw: {
    regionType: 'MwCareerRegion',
    countryName: "Malawi",
    hubs: [
      h('FWDW', "Dwangwa Airport", 'MW-C', 'regional', -12.51753, 34.13188, 'drySpoke', 'wave-d'),
      h('FWKA', "Karonga Airport", 'MW-C', 'regional', -9.95357, 33.89326, 'drySpoke', 'wave-d'),
      h('FWUU', "Mzuzu Airport", 'MW-C', 'regional', -11.4447, 34.0118, 'drySpoke', 'polish'),
    ],
  },
  cd: {
    regionType: 'CdCareerRegion',
    countryName: "DR Congo",
    hubs: [
      h('FZWA', "Mbuji Mayi Airport", 'CD-S', 'regional', -6.12124, 23.569, 'drySpoke', 'wave-d'),
      h('FZBO', "Bandundu Airport", 'CD-W', 'regional', -3.31132, 17.3817, 'drySpoke', 'wave-d'),
      h('FZKA', "Bunia Airport", 'CD-N', 'regional', 1.56574, 30.22068, 'drySpoke', 'polish'),
      h('FZFD', "Gbadolite Airport", 'CD-N', 'regional', 4.25274, 20.97527, 'drySpoke', 'polish'),
    ],
  },
  mg: {
    regionType: 'MgCareerRegion',
    countryName: "Madagascar",
    hubs: [
      h('FMNM', "Amborovy Airport", 'MG-C', 'regional', -15.66684, 46.35123, 'city', 'wave-d'),
      h('FMNN', "Nosy Be International Airport", 'MG-E', 'regional', -13.3121, 48.3148, 'city', 'wave-d'),
      h('FMNA', "Arrachart Airport", 'MG-E', 'regional', -12.3494, 49.2917, 'drySpoke', 'wave-d'),
      h('FMNQ', "Besalampy Airport", 'MG-C', 'regional', -16.74453, 44.48248, 'drySpoke', 'polish'),
      h('FMSM', "Mananjary Airport", 'MG-E', 'regional', -21.2018, 48.3583, 'drySpoke', 'polish'),
    ],
  },
  mr: {
    regionType: 'MrCareerRegion',
    countryName: "Mauritania",
    hubs: [
      h('GQPA', "Atar International Airport", 'MR-W', 'regional', 20.5068, -13.0432, 'drySpoke', 'wave-d'),
      h('GQPZ', "Tazadit Airport", 'MR-W', 'regional', 22.75735, -12.48223, 'drySpoke', 'polish'),
    ],
  },
  pt: {
    regionType: 'PtCareerRegion',
    countryName: "Portugal",
    hubs: [
      h('LPSO', "Ponte de Sor", 'PT-C', 'regional', 39.2116, -8.05654, 'drySpoke', 'polish'),
      h('LPBG', "Bragança Airport", 'PT-N', 'regional', 41.8578, -6.70713, 'drySpoke', 'polish'),
      h('LPFL', "Flores Airport", 'PT-C', 'regional', 39.4553, -31.1314, 'drySpoke', 'polish'),
    ],
  },
  es: {
    regionType: 'EsCareerRegion',
    countryName: "Spain",
    hubs: [
      h('GCRR', "César Manrique-Lanzarote Airport", 'ES-S', 'regional', 28.9455, -13.6052, 'city', 'polish'),
      h('GCFV', "Fuerteventura Airport", 'ES-S', 'regional', 28.4527, -13.8638, 'city', 'polish'),
      h('LEGE', "Girona-Costa Brava Airport", 'ES-N', 'regional', 41.90464, 2.76177, 'city', 'polish'),
    ],
  },
  fr: {
    regionType: 'FrCareerRegion',
    countryName: "France",
    hubs: [
      h('LFKB', "Bastia Poretta", 'FR-S', 'regional', 42.5527, 9.48373, 'drySpoke', 'polish'),
      h('LFKF', "Figari Sud-Corse Airport", 'FR-S', 'regional', 41.50185, 9.09709, 'city', 'polish'),
      h('LFKJ', "Ajaccio Napoléon Bonaparte airport", 'FR-S', 'regional', 41.9236, 8.80292, 'drySpoke', 'polish'),
    ],
  },
  gb: {
    regionType: 'GbCareerRegion',
    countryName: "United Kingdom",
    hubs: [
      h('EGPD', "Aberdeen Dyce", 'GB-N', 'regional', 57.2019, -2.19778, 'drySpoke', 'polish'),
      h('EGGW', "London Luton Airport", 'GB-S', 'regional', 51.8747, -0.36833, 'city', 'polish'),
      h('EGPR', "Barra Airport", 'GB-N', 'regional', 57.0228, -7.44306, 'drySpoke', 'polish'),
    ],
  },
  de: {
    regionType: 'DeCareerRegion',
    countryName: "Germany",
    hubs: [
      h('EDHK', "Kiel Holtenau", 'DE-N', 'regional', 54.3795, 10.1452, 'drySpoke', 'polish'),
      h('EDVK', "Kassel Airport", 'DE-W', 'regional', 51.41839, 9.39164, 'city', 'polish'),
      h('EDLP', "Paderborn Lippstadt Airport", 'DE-W', 'regional', 51.61253, 8.61746, 'city', 'polish'),
    ],
  },
  nl: {
    regionType: 'NlCareerRegion',
    countryName: "Netherlands",
    hubs: [
      h('EHKD', "De Kooy Airfield / Den Helder Naval Air Station", 'NL-C', 'regional', 52.9234, 4.78062, 'drySpoke', 'polish'),
      h('EHDL', "Deelen Air Base", 'NL-C', 'regional', 52.0606, 5.87306, 'drySpoke', 'polish'),
    ],
  },
  it: {
    regionType: 'ItCareerRegion',
    countryName: "Italy",
    hubs: [
      h('LIPR', "Federico Fellini International Airport", 'IT-N', 'regional', 44.02002, 12.6122, 'city', 'polish'),
      h('LIMJ', "Genoa Cristoforo Colombo Airport", 'IT-N', 'regional', 44.41204, 8.84073, 'city', 'polish'),
      h('LIEO', "Olbia Costa Smeralda Airport", 'IT-C', 'regional', 40.89895, 9.51846, 'city', 'polish'),
    ],
  },
};

/** @type {Record<string, Pack>} */
const PACKS = mergePackMaps(EXISTING_EU_PACKS, EXPANSION_PACKS);

function mergePackMaps(...maps) {
  /** @type {Record<string, Pack>} */
  const merged = {};
  for (const map of maps) {
    for (const [code, pack] of Object.entries(map)) {
      const current = merged[code];
      merged[code] = current
        ? { ...current, hubs: [...current.hubs, ...pack.hubs] }
        : { ...pack, hubs: [...pack.hubs] };
    }
  }
  return merged;
}

function h(icao, name, region, hubTier, lat, lon, kind = 'drySpoke', phase = 'wave-b-eu') {
  return { icao, name, region, hubTier, lat, lon, kind, phase };
}

function loadExistingIcaos(code) {
  const set = new Set();
  for (const file of [`career-${code}-hubs.ts`, `career-${code}-hubs-densify.ts`]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    for (const m of txt.matchAll(/icao:\s*'([A-Z0-9]+)'/g)) set.add(m[1]);
  }
  return set;
}

function fmtHub(hub) {
  const b = BIASES[hub.kind] ?? BIASES.drySpoke;
  return [
    '  {',
    `    icao: '${hub.icao}',`,
    `    name: ${JSON.stringify(hub.name)},`,
    `    region: '${hub.region}',`,
    `    hubTier: '${hub.hubTier}',`,
    `    lat: ${hub.lat},`,
    `    lon: ${hub.lon},`,
    `    produce: ${JSON.stringify(b.produce)},`,
    `    consume: ${JSON.stringify(b.consume)},`,
    '  },',
  ].join('\n');
}

function writeNewDensify(code, pack, hubs) {
  const Code = code.toUpperCase();
  const Camel = code[0].toUpperCase() + code.slice(1);
  const body = `/**
 * ${pack.countryName} densify — Wave B/D commercial hubs (MSFS + SimBrief).
 * Merged into ${Code}_CAREER_HUBS. No bush strips.
 */
import type { CommodityId, HubTier } from './types/career-economy.js';
import type { ${pack.regionType} } from './career-${code}-hubs.js';

type ${Camel}DensifyHub = {
  icao: string;
  name: string;
  region: ${pack.regionType};
  hubTier: HubTier;
  lat: number;
  lon: number;
  produce: Partial<Record<CommodityId, number>>;
  consume: Partial<Record<CommodityId, number>>;
};

/** ${Code} densify (+${hubs.length}). */
export const ${Code}_DENSIFY_HUBS: readonly ${Camel}DensifyHub[] = [
${hubs.map(fmtHub).join('\n')}
];

export const ${Code}_DENSIFY_HUB_COUNT = ${Code}_DENSIFY_HUBS.length;
`;
  fs.writeFileSync(path.join(ROOT, `career-${code}-hubs-densify.ts`), body);
}

function appendDensify(code, hubs) {
  const p = path.join(ROOT, `career-${code}-hubs-densify.ts`);
  let txt = fs.readFileSync(p, 'utf8');
  const existing = loadExistingIcaos(code);
  const fresh = hubs.filter((x) => !existing.has(x.icao));
  if (!fresh.length) return 0;
  const insert = fresh.map(fmtHub).join('\n') + '\n';
  if (!txt.includes('_DENSIFY_HUBS')) {
    throw new Error(`No densify array in ${p}`);
  }
  const re = /(export const [A-Z]+_DENSIFY_HUBS[^=]*=\s*\[[\s\S]*?)(\n\];)/;
  const m = txt.match(re);
  if (!m) throw new Error(`Cannot find densify array end in ${p}`);
  txt = txt.replace(re, `$1\n${insert}$2`);
  // Fix count line to use .length
  txt = txt.replace(
    /export const ([A-Z]+)_DENSIFY_HUB_COUNT = \d+;/,
    'export const $1_DENSIFY_HUB_COUNT = $1_DENSIFY_HUBS.length;',
  );
  if (!/export const [A-Z]+_DENSIFY_HUB_COUNT = [A-Z]+_DENSIFY_HUBS\.length;/.test(txt)) {
    const Code = code.toUpperCase();
    if (!txt.includes(`${Code}_DENSIFY_HUB_COUNT`)) {
      txt += `\nexport const ${Code}_DENSIFY_HUB_COUNT = ${Code}_DENSIFY_HUBS.length;\n`;
    }
  }
  fs.writeFileSync(p, txt);
  return fresh.length;
}

function wireHubCatalog(code) {
  const p = path.join(ROOT, `career-${code}-hubs.ts`);
  if (!fs.existsSync(p)) {
    console.warn('missing hub catalog', code);
    return false;
  }
  let txt = fs.readFileSync(p, 'utf8');
  const Code = code.toUpperCase();
  const densifyImport = `import { ${Code}_DENSIFY_HUBS, ${Code}_DENSIFY_HUB_COUNT } from './career-${code}-hubs-densify.js';`;
  if (!txt.includes(`career-${code}-hubs-densify`)) {
    // Insert after the last complete import (never mid multi-line import {).
    const importBlocks = [
      ...txt.matchAll(/^import\s+[\s\S]*?;$/gm),
    ];
    const last = importBlocks[importBlocks.length - 1];
    if (!last) throw new Error(`no imports in ${p}`);
    const idx = last.index + last[0].length;
    txt = `${txt.slice(0, idx)}\n${densifyImport}${txt.slice(idx)}`;
  }
  if (!txt.includes(`...${Code}_DENSIFY_HUBS`)) {
    const re = new RegExp(
      `(export const ${Code}_CAREER_HUBS[^=]*=\\s*\\[[\\s\\S]*?)(\\n\\];)`,
    );
    if (!re.test(txt)) throw new Error(`Cannot spread densify into ${p}`);
    txt = txt.replace(re, `$1\n  ...${Code}_DENSIFY_HUBS,$2`);
  }
  const countRe = new RegExp(
    `export const ${Code}_CAREER_HUB_COUNT = (\\d+);`,
  );
  if (countRe.test(txt)) {
    const base = Number(txt.match(countRe)[1]);
    txt = txt.replace(
      countRe,
      `export const ${Code}_CAREER_HUB_COUNT = ${base} + ${Code}_DENSIFY_HUB_COUNT;`,
    );
  }
  const double = new RegExp(
    `export const ${Code}_CAREER_HUB_COUNT = (\\d+) \\+ ${Code}_DENSIFY_HUB_COUNT \\+ ${Code}_DENSIFY_HUB_COUNT;`,
  );
  if (double.test(txt)) {
    txt = txt.replace(
      double,
      `export const ${Code}_CAREER_HUB_COUNT = $1 + ${Code}_DENSIFY_HUB_COUNT;`,
    );
  }
  fs.writeFileSync(p, txt);
  return true;
}

function main() {
  const summary = [];
  const phases = new Map();
  let total = 0;
  // Only treat as append if densify file already exists on disk.
  for (const [code, pack] of Object.entries(PACKS)) {
    const existing = loadExistingIcaos(code);
    const hubs = pack.hubs.filter(
      (x) => !existing.has(x.icao) && !FORBIDDEN.has(x.icao),
    );
    if (!hubs.length) {
      summary.push({ code, added: 0, note: 'all dupes' });
      const densifyPath = path.join(ROOT, `career-${code}-hubs-densify.ts`);
      if (fs.existsSync(densifyPath)) wireHubCatalog(code);
      continue;
    }
    const densifyPath = path.join(ROOT, `career-${code}-hubs-densify.ts`);
    if (APPEND_CODES.has(code) && fs.existsSync(densifyPath)) {
      const n = appendDensify(code, hubs);
      summary.push({ code, added: n, note: 'append' });
      total += n;
    } else if (fs.existsSync(densifyPath) && !APPEND_CODES.has(code)) {
      // unexpected existing — append
      const n = appendDensify(code, hubs);
      summary.push({ code, added: n, note: 'append-new' });
      total += n;
    } else {
      writeNewDensify(code, pack, hubs);
      summary.push({ code, added: hubs.length, note: 'new' });
      total += hubs.length;
    }
    for (const hub of hubs) {
      const phase = hub.phase ?? 'wave-b-eu';
      phases.set(phase, (phases.get(phase) ?? 0) + 1);
    }
    wireHubCatalog(code);
  }
  console.log('=== Wave B / D / polish densify ===');
  for (const s of summary) console.log(`  ${s.code}: +${s.added} (${s.note})`);
  for (const [phase, added] of phases) console.log(`  ${phase}: +${added}`);
  const configuredExpansion = Object.values(EXPANSION_PACKS)
    .reduce((sum, pack) => sum + pack.hubs.length, 0);
  const configuredByCountry = Object.fromEntries(
    Object.entries(EXPANSION_PACKS).map(([code, pack]) => [code, pack.hubs.length]),
  );
  const configuredPhases = {};
  for (const pack of Object.values(EXPANSION_PACKS)) {
    for (const hub of pack.hubs) {
      configuredPhases[hub.phase] = (configuredPhases[hub.phase] ?? 0) + 1;
    }
  }
  const allDensifyNet = 58 + configuredExpansion;
  const estimatedSeed = 1679 + allDensifyNet;
  console.log('Run total +', total);
  console.log('Configured expansion +', configuredExpansion);
  console.log('All densify net +', allDensifyNet);
  console.log('Estimated seed total:', estimatedSeed);
  fs.writeFileSync(
    path.join(__dirname, '_wave-b-d-summary.json'),
    JSON.stringify(
      {
        runTotal: total,
        configuredExpansion,
        allDensifyNet,
        estimatedSeed,
        configuredPhases,
        configuredByCountry,
        phases: Object.fromEntries(phases),
        summary,
      },
      null,
      2,
    ),
  );
}

main();
