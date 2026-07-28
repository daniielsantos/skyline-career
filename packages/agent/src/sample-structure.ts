import type { AircraftStructure } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/**
 * Classic named tanks for fingerprinting when FUELSYSTEM capacities are empty.
 * Indices must stay aligned with structureFromProfile CLASSIC_TANK_INDEX.
 */
const CLASSIC_FINGERPRINT_SLOTS: Array<{ id: string; capacityVar: string; index: number }> = [
  { id: 'LEFT_MAIN', capacityVar: 'FUEL TANK LEFT MAIN CAPACITY', index: 1 },
  { id: 'RIGHT_MAIN', capacityVar: 'FUEL TANK RIGHT MAIN CAPACITY', index: 2 },
  { id: 'LEFT_AUX', capacityVar: 'FUEL TANK LEFT AUX CAPACITY', index: 3 },
  { id: 'RIGHT_AUX', capacityVar: 'FUEL TANK RIGHT AUX CAPACITY', index: 4 },
  { id: 'CENTER', capacityVar: 'FUEL TANK CENTER CAPACITY', index: 5 },
  { id: 'CENTER2', capacityVar: 'FUEL TANK CENTER2 CAPACITY', index: 6 },
];

/**
 * Sample live tank/station schema for fingerprinting.
 * Station maxLoad/arm are placeholders — fingerprint hash ignores them
 * (same contract as structureFromProfile).
 */
export async function sampleAircraftStructure(bridge: NamedPipeSimBridge): Promise<{
  structure: AircraftStructure;
  liveWeights: { emptyWeightLb?: number; maxGrossWeightLb?: number };
}> {
  const tankSchema: AircraftStructure['tankSchema'] = [];

  for (let i = 1; i <= 8; i++) {
    try {
      const capacity = await bridge.readSimVar({
        name: `FUELSYSTEM TANK CAPACITY:${i}`,
        unit: 'gallons',
      });
      if (!Number.isFinite(capacity) || capacity < 5) {
        continue;
      }
      tankSchema.push({
        index: i,
        name: `FUELSYSTEM:${i}`,
        capacity,
        unit: 'gallons',
      });
    } catch {
      // tank not present
    }
  }

  if (tankSchema.length === 0) {
    for (const slot of CLASSIC_FINGERPRINT_SLOTS) {
      try {
        const capacity = await bridge.readSimVar({
          name: slot.capacityVar,
          unit: 'gallons',
        });
        if (!Number.isFinite(capacity) || capacity < 5) {
          continue;
        }
        tankSchema.push({
          index: slot.index,
          name: slot.id,
          capacity,
          unit: 'gallons',
        });
      } catch {
        // slot not present
      }
    }
  }

  let stationCount = 8;
  try {
    stationCount = Math.max(
      1,
      Math.min(
        16,
        Math.round(
          await bridge.readSimVar({
            name: 'PAYLOAD STATION COUNT',
            unit: 'number',
          }),
        ),
      ),
    );
  } catch {
    stationCount = 8;
  }

  const stationSchema: AircraftStructure['stationSchema'] = [];
  for (let i = 1; i <= stationCount; i++) {
    stationSchema.push({
      index: i,
      name: `Station ${i}`,
      maxLoad: 500,
      arm: 0,
    });
  }

  const liveWeights: { emptyWeightLb?: number; maxGrossWeightLb?: number } = {};
  try {
    liveWeights.emptyWeightLb = await bridge.readSimVar({ name: 'EMPTY WEIGHT', unit: 'pounds' });
  } catch {
    // optional
  }
  try {
    liveWeights.maxGrossWeightLb = await bridge.readSimVar({
      name: 'MAX GROSS WEIGHT',
      unit: 'pounds',
    });
  } catch {
    // optional
  }

  return {
    structure: {
      tankSchema,
      stationSchema,
      weightLimits: {},
    },
    liveWeights,
  };
}
