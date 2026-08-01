import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSeedEconomyWorld,
  HUB_LEVEL_CURVE_VERSION,
  HUB_LEVEL_XP_PER_TICK_CAP,
  HUB_LEVEL_XP_TO_REACH,
  hubLevelFromXp,
  hubLevelLaneBonus,
  hubLevelOriginPayMult,
  hubLevelProfile,
  hubLevelXpProgress,
  laneLotCaps,
  migrateEconomyWorld,
  recordHubActivity,
  tickEconomyN,
  tickHubLevels,
} from './career-economy.js';

describe('hub development level', () => {
  it('seeds level 1 with XP floor and sticky profiles', () => {
    const world = createSeedEconomyWorld({ seed: 'hub-level-seed' });
    for (const ap of world.airports) {
      assert.equal(ap.level, 1);
      assert.equal(ap.levelXp, 0);
      assert.equal(ap.levelCurveVersion, HUB_LEVEL_CURVE_VERSION);
      assert.ok(typeof ap.activityScore === 'number');
    }
    assert.equal(hubLevelProfile(1).laneBonus, 0);
    assert.equal(hubLevelProfile(5).laneBonus, 2);
    assert.ok(hubLevelOriginPayMult(5) > hubLevelOriginPayMult(1));
    assert.equal(hubLevelLaneBonus(1, 5), 2);
  });

  it('adds lane capacity at higher levels without changing tier caps baseline', () => {
    const base = laneLotCaps('spoke', 'spoke');
    const boosted = laneLotCaps('spoke', 'spoke', {
      originLevel: 5,
      destLevel: 5,
    });
    assert.ok(boosted.maxLots > base.maxLots);
  });

  it('caps XP earned in a single tick', () => {
    const world = createSeedEconomyWorld({ seed: 'hub-level-cap' });
    world.tick = 10;
    for (let i = 0; i < 40; i++) {
      recordHubActivity(world, 'SBGR', 2);
    }
    const ap = world.airports.find((a) => a.icao === 'SBGR')!;
    assert.ok((ap.levelXp ?? 0) <= HUB_LEVEL_XP_PER_TICK_CAP + 0.001);
  });

  it('promotes on traffic XP when warehouses are healthy — never demotes from neglect', () => {
    const world = createSeedEconomyWorld({ seed: 'hub-level-promo' });
    const ap = world.airports.find((a) => a.icao === 'SBGR')!;
    for (const pile of Object.values(ap.inventory)) {
      if (!pile) continue;
      pile.stockKg = Math.round(pile.capacityKg * 0.55);
    }
    const need = HUB_LEVEL_XP_TO_REACH[2]!;
    // Grant across ticks to bypass per-tick cap.
    let left = need;
    let t = 1;
    while (left > 0) {
      world.tick = t;
      const chunk = Math.min(HUB_LEVEL_XP_PER_TICK_CAP, left);
      recordHubActivity(world, 'SBGR', chunk);
      left -= chunk;
      t += 1;
    }
    world.tick = 6;
    const { promoted } = tickHubLevels(world);
    assert.ok(promoted.some((p) => p.icao === 'SBGR' && p.to >= 2));
    assert.ok(ap.level >= 2);
    const capAfter = ap.inventory.general!.capacityKg;

    ap.activityScore = 0;
    for (let i = 0; i < 20; i++) {
      world.tick += 6;
      tickHubLevels(world);
    }
    assert.ok(ap.level >= 2);
    assert.equal(ap.inventory.general!.capacityKg, capAfter);
  });

  it('resyncs overleveled saves when the XP curve is retuned', () => {
    const seeded = createSeedEconomyWorld({ seed: 'hub-level-curve' });
    const ap = seeded.airports.find((a) => a.icao === 'SBPV')!;
    ap.level = 5;
    ap.levelXp = 900; // old-curve "max" that is only mid-tier on v2
    ap.levelCurveVersion = 1;
    const raw = {
      version: 3 as const,
      seed: 'hub-level-curve',
      tick: 50,
      lastSyncedAtMs: Date.now(),
      airports: seeded.airports,
      lots: [],
      events: [],
      npcs: seeded.npcs,
      npcFlights: [],
      fuelTrucks: seeded.fuelTrucks,
      fuelHauls: [],
    };
    const migrated = migrateEconomyWorld(raw);
    const spoke = migrated.airports.find((a) => a.icao === 'SBPV')!;
    assert.equal(spoke.levelCurveVersion, HUB_LEVEL_CURVE_VERSION);
    assert.equal(spoke.level, hubLevelFromXp(900));
    assert.ok(spoke.level < 5);
  });

  it('busy major gains XP from market traffic over time but stays below L5 in 2 days', () => {
    const world = createSeedEconomyWorld({ seed: 'hub-level-traffic' });
    const before = world.airports.find((a) => a.icao === 'SBGR')!.levelXp ?? 0;
    tickEconomyN(world, 48, { advanceWallClock: true });
    const gru = world.airports.find((a) => a.icao === 'SBGR')!;
    const after = gru.levelXp ?? 0;
    assert.ok(after > before, `expected SBGR XP to rise (${before} → ${after})`);
    assert.ok(gru.level < 5, `SBGR should not hit L5 in 48h (level ${gru.level})`);
    const progress = hubLevelXpProgress(gru);
    assert.ok(progress.level >= 1);
  });
});
