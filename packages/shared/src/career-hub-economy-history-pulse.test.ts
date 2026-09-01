import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateHubEconomyHistoryPulse } from './career-hub-economy-history-pulse.js';
import type { HubEconomySample } from './types/career-economy.js';

function sample(
  partial: Partial<HubEconomySample> & {
    icao: string;
    dayIndex: number;
    countryId: string;
  },
): HubEconomySample {
  return {
    icao: partial.icao,
    dayIndex: partial.dayIndex,
    tick: partial.tick ?? partial.dayIndex * 96,
    countryId: partial.countryId,
    region: partial.region ?? `${partial.countryId}-X`,
    hubTier: partial.hubTier ?? 'spoke',
    activityScore: partial.activityScore ?? 40,
    hubLevel: partial.hubLevel ?? 1,
    quiet: partial.quiet ?? false,
    jetAFill: partial.jetAFill ?? 0.5,
    outboundLots: partial.outboundLots ?? 0,
    outboundKg: partial.outboundKg ?? 0,
    payP50Usd: partial.payP50Usd ?? null,
    kgGa: partial.kgGa ?? 0,
    kgTp: partial.kgTp ?? 0,
    kgMedium: partial.kgMedium ?? 0,
    kgNarrow: partial.kgNarrow ?? 0,
    kgWide: partial.kgWide ?? 0,
    lotsGa: partial.lotsGa ?? 0,
    lotsTp: partial.lotsTp ?? 0,
    lotsMedium: partial.lotsMedium ?? 0,
    lotsNarrow: partial.lotsNarrow ?? 0,
    lotsWide: partial.lotsWide ?? 0,
    cargoStockKg: partial.cargoStockKg ?? 5_000,
    cargoCapacityKg: partial.cargoCapacityKg ?? 10_000,
    inboundKg: partial.inboundKg ?? 0,
    commodities: partial.commodities ?? [
      { id: 'general', fill: 0.5, spotUsd: 2 },
      { id: 'electronics', fill: 0.2, spotUsd: 20 },
    ],
  };
}

describe('aggregateHubEconomyHistoryPulse', () => {
  it('builds world / country / tier series by day', () => {
    const samples: HubEconomySample[] = [
      sample({
        icao: 'SBGR',
        dayIndex: 1,
        countryId: 'BR',
        hubTier: 'major',
        outboundLots: 4,
        outboundKg: 8_000,
        payP50Usd: 1_000,
        kgGa: 400,
        lotsGa: 2,
      }),
      sample({
        icao: 'SBPV',
        dayIndex: 1,
        countryId: 'BR',
        hubTier: 'spoke',
        quiet: true,
        outboundLots: 0,
      }),
      sample({
        icao: 'KJFK',
        dayIndex: 1,
        countryId: 'US',
        hubTier: 'major',
        outboundLots: 3,
        outboundKg: 6_000,
        payP50Usd: 2_000,
        kgTp: 3_000,
        lotsTp: 1,
      }),
      sample({
        icao: 'SBGR',
        dayIndex: 2,
        countryId: 'BR',
        hubTier: 'major',
        outboundLots: 5,
        payP50Usd: 1_100,
      }),
    ];
    const pulse = aggregateHubEconomyHistoryPulse(samples);
    assert.equal(pulse.sampleDays, 2);
    assert.equal(pulse.hubSamples, 4);
    assert.equal(pulse.days[0]!.world.hubs, 3);
    assert.equal(pulse.days[0]!.world.liveHubs, 2);
    assert.ok(Math.abs(pulse.days[0]!.world.liveHubPct - 2 / 3) < 1e-9);
    assert.equal(pulse.days[0]!.byCountry.BR?.hubs, 2);
    assert.equal(pulse.days[0]!.byCountry.BR?.quietHubs, 1);
    assert.equal(pulse.days[0]!.byCountry.US?.liveHubs, 1);
    assert.equal(pulse.days[0]!.byTier.spoke.quietHubs, 1);
    assert.equal(pulse.days[0]!.byTier.major.liveHubs, 2);
    assert.equal(pulse.days[1]!.world.hubs, 1);
    assert.ok(pulse.days[0]!.world.spotGeneralUsd != null);
    // Two hubs with pay → p10/p50/p90 of {1000, 2000}.
    assert.equal(pulse.days[0]!.world.payP50Usd, 1500);
    assert.ok(pulse.days[0]!.world.payP10Usd != null);
    assert.ok(pulse.days[0]!.world.payP90Usd != null);
    assert.ok(
      (pulse.days[0]!.world.payP10Usd as number) <=
        (pulse.days[0]!.world.payP50Usd as number),
    );
    assert.ok(
      (pulse.days[0]!.world.payP90Usd as number) >=
        (pulse.days[0]!.world.payP50Usd as number),
    );
  });
});
