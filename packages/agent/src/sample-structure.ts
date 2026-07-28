import type { AircraftStructure } from '@msfs-compat/shared';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';

/**
 * Sample live tank/station schema for fingerprinting.
 * Weight limits are read for telemetry but left empty in structure used for hash stability
 * (same as structureFromProfile).
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
