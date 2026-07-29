/** Skyline Career — local cargo logistics economy (Slice 1). */

export type CommodityId = 'electronics' | 'perishables' | 'machinery' | 'general';

export interface CommodityDef {
  id: CommodityId;
  name: string;
  /** Reference price USD per kg at balanced stock. */
  basePricePerKg: number;
  perishable?: boolean;
  highValue?: boolean;
}

export interface StockPile {
  stockKg: number;
  capacityKg: number;
}

export interface AirportTerminal {
  icao: string;
  name: string;
  /** Geographic / economic region tag for shocks later. */
  region: string;
  /**
   * Terminal development level (Transport Fever–style growth later).
   * MVP: affects capacity slightly; raised when shortages are repeatedly filled.
   */
  level: number;
  inventory: Partial<Record<CommodityId, StockPile>>;
  /** Net production per tick (kg). Negative means net consumer only via consumption. */
  production: Partial<Record<CommodityId, number>>;
  /** Consumption per tick (kg). */
  consumption: Partial<Record<CommodityId, number>>;
}

export type ShipmentLotStatus = 'available' | 'reserved' | 'in_transit' | 'delivered' | 'expired';

export interface ShipmentLot {
  id: string;
  commodityId: CommodityId;
  originIcao: string;
  destIcao: string;
  quantityKg: number;
  reservedKg: number;
  /** Created on this world tick. */
  createdAtTick: number;
  /** Soft expiry; perishables expire sooner. */
  expiresAtTick: number;
  /** Freight pay USD for the full lot (before urgency multipliers already baked in). */
  payUsd: number;
  urgency: 'normal' | 'urgent';
  /** Short economic reason (surplus → shortage). */
  reason: string;
  status: ShipmentLotStatus;
}

export interface CareerEconomyWorld {
  version: 1;
  seed: string;
  tick: number;
  airports: AirportTerminal[];
  lots: ShipmentLot[];
}

export interface MarketLotView {
  lot: ShipmentLot;
  originName: string;
  destName: string;
  commodityName: string;
  availableKg: number;
  payPerKgUsd: number;
  originStockKg: number;
  destStockKg: number;
  originFillPct: number;
  destFillPct: number;
}

/** Freighter capacity classes (Slice 2) — filter market + drive SimBrief dispatch. */
export type FreighterClassId = 'narrow_freighter' | 'wide_freighter';

export interface AircraftClass {
  id: FreighterClassId;
  name: string;
  /** Soft cargo weight limit used for accept clamp / market viability. */
  maxCargoKg: number;
  maxRangeNm: number;
  /** Repo-relative OFP roles pack path. */
  rolesPackRelPath: string;
  simbriefIcao: string;
  simbriefAirframeMatch: string;
}

export type MissionStatus =
  | 'accepted'
  | 'dispatched'
  | 'in_flight'
  | 'settled'
  | 'cancelled'
  | 'failed';

/**
 * What the player committed to haul — source of truth for dispatch prefill
 * and later Intent→OFP validation.
 */
export interface MissionIntent {
  id: string;
  shipmentLotId: string;
  commodityId: CommodityId;
  originIcao: string;
  destIcao: string;
  cargoKg: number;
  /** Freighter MVP always 0. */
  pax: 0;
  aircraftClassId: FreighterClassId;
  rolesPackRelPath: string;
  /** Economy tick by which delivery is due (from lot expiry). */
  deadlineTick: number;
  /** Pro-rata freight pay for this cargoKg. */
  payUsd: number;
  urgency: 'normal' | 'urgent';
  reason: string;
  status: MissionStatus;
  acceptedAtTick: number;
  /** Set when career dispatch opens SimBrief. */
  staticId?: string;
  dispatchedAtTick?: number;
}

export interface CareerMissionsState {
  version: 1;
  missions: MissionIntent[];
}
