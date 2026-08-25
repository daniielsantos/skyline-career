/**
 * Browser-safe: which MSFS add-on(s) a Market SKU is homologated against.
 * Do not import @msfs-compat/shared from the Vite client.
 */

export type AirframeAddon = {
  publisher: string;
  /** Product line when it is not obvious from the Skyline card name. */
  product?: string;
};

const PUBLISHER_BY_PREFIX: Array<{ prefix: string; publisher: string }> = [
  { prefix: 'blacksquare', publisher: 'Black Square' },
  { prefix: 'blackbox', publisher: 'BlackBox' },
  { prefix: 'blackbird', publisher: 'Blackbird Simulations' },
  { prefix: 'workingtitle', publisher: 'Working Title' },
  { prefix: 'justflight', publisher: 'Just Flight' },
  { prefix: 'inibuilds', publisher: 'iniBuilds' },
  { prefix: 'flysimware', publisher: 'Flysimware' },
  { prefix: 'flightfx', publisher: 'FlightFX' },
  { prefix: 'fsreborn', publisher: 'FSReborn' },
  { prefix: 'nextgensim', publisher: 'NextGen Simulations' },
  { prefix: 'leonardo', publisher: 'Leonardo' },
  { prefix: 'carenado', publisher: 'Carenado' },
  { prefix: 'fenix', publisher: 'Fenix Simulations' },
  { prefix: 'pmdg', publisher: 'PMDG' },
  { prefix: 'toliss', publisher: 'ToLiss' },
  { prefix: 'tfdi', publisher: 'TFDi Design' },
  { prefix: 'skyward', publisher: 'Skyward' },
  { prefix: 'a2a', publisher: 'A2A Simulations' },
  { prefix: 'asobo', publisher: 'Asobo' },
  { prefix: 'microsoft', publisher: 'Microsoft' },
  { prefix: 'sws', publisher: 'SimWorks Studios' },
];

/** typeId prefix is wrong or the SKU covers more than one store product. */
const ADDONS_BY_TYPE_ID: Record<string, AirframeAddon[]> = {
  'c208-caravan-cargo': [
    { publisher: 'Asobo', product: 'C208B Grand Caravan' },
    { publisher: 'Black Square', product: 'Caravan Professional' },
  ],
  'microsoft-a320neo-v2': [
    { publisher: 'iniBuilds', product: 'A320neo V2' },
  ],
  'microsoft-a321lr': [{ publisher: 'iniBuilds', product: 'A321neo LR' }],
  'microsoft-pc-12-ngx-passengers': [
    { publisher: 'Carenado', product: 'PC-12 NGX' },
  ],
  'microsoft-pc-24-cargo': [
    { publisher: 'Carenado', product: 'PC-24' },
  ],
  'microsoft-c408-skycourier-cargo': [
    { publisher: 'Carenado', product: 'Cessna 408 SkyCourier' },
  ],
  'microsoft-king-air-c90-gtx-passengers': [
    { publisher: 'Carenado', product: 'King Air C90 GTx' },
  ],
  'microsoft-atr-42-600': [
    {
      publisher: 'Microsoft',
      product: 'ATR 42-600 (Highline / Passenger / Cargo)',
    },
  ],
  'microsoft-atr-72-600': [
    {
      publisher: 'Microsoft',
      product: 'ATR 72-600 (Highline / Passenger / Cargo)',
    },
  ],
};

function publisherFromStem(stem: string): string | null {
  const lower = stem.trim().toLowerCase();
  if (!lower) return null;
  for (const row of PUBLISHER_BY_PREFIX) {
    if (lower === row.prefix || lower.startsWith(`${row.prefix}-`)) {
      return row.publisher;
    }
  }
  return null;
}

/** Homologated MSFS add-ons for a Market / Hangar typeId. */
export function listAirframeAddons(
  airframeTypeId: string | null | undefined,
): AirframeAddon[] {
  const id = airframeTypeId?.trim();
  if (!id) return [];
  const override = ADDONS_BY_TYPE_ID[id];
  if (override) return override;
  const publisher = publisherFromStem(id);
  if (publisher) return [{ publisher }];
  return [];
}
