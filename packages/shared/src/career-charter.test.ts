import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHARTER_BOARD_MAX,
  CHARTER_BOARD_MIN,
  CHARTER_GROUP_SIZE_MAX,
  CHARTER_NARROW_GROUP_MAX,
  CHARTER_MAX_DISTANCE_NM,
  PORT_CHARTER_DESK_LIMIT,
  charterMaxDistanceNm,
  pickPortCharterDeskRows,
  CHARTER_WARM_QUOTA_PER_TICK,
  cancelCharterMission,
  charterBaggageKg,
  charterPayPaxWeight,
  compareMissionIntentToOfp,
  countryIdFromRegion,
  createSeedEconomyWorld,
  emptyMissionsStateV2,
  executeSettleFlight,
  expireCharterOffers,
  formCharterOffersForTick,
  generateDailyCharterOffers,
  normalizeOfpExpectation,
  pickCharterGroupSize,
  quoteCharterPayUsd,
  readCharterHubPoolView,
  isCharterEligibleAircraftClass,
  listPortCharterDesk,
  portCharterLobbyCap,
  portCharterLobbyRosterMult,
  overlayLiveEconomyOntoPulseSnapshot,
  reserveCharterOffer,
  settleCharterMission,
  tickCharterEconomy,
  tickCharterPools,
  syncWorldPortConcessions,
  tickEconomy,
  TICKS_PER_DAY,
} from './index.js';

describe('Charter economy', () => {
  it('keeps a charter hold that landed after the pulse snapshot was cloned', () => {
    const snapshot = {
      airports: [{ icao: 'KMIA' }],
      charterOffers: [{ id: 'charter-offer:1', status: 'available' }],
      charterHubs: [{ icao: 'KMIA', waitingPax: 40 }],
      charterDemand: [{ id: 'd1', pressure: 1 }],
      demandOrders: [{ id: 'order-old' }],
      portListings: [{ id: 'listing-old' }],
      portConcessions: [],
      fuelHauls: [],
    } as unknown as Parameters<typeof overlayLiveEconomyOntoPulseSnapshot>[0];
    const live = {
      airports: [{ icao: 'KMIA' }],
      charterOffers: [
        { id: 'charter-offer:1', status: 'available' },
        { id: 'charter-offer:port:9:KMIA:MZBZ', status: 'available' },
      ],
      charterHubs: [{ icao: 'KMIA', waitingPax: 22 }],
      charterDemand: [{ id: 'd1', pressure: 4 }],
      demandOrders: [{ id: 'order-new' }],
      portListings: [{ id: 'listing-new' }],
      portConcessions: [{ portId: 'KMIA', companyId: 'co' }],
      fuelHauls: [{ id: 'haul-1' }],
    } as unknown as Parameters<typeof overlayLiveEconomyOntoPulseSnapshot>[1];
    overlayLiveEconomyOntoPulseSnapshot(snapshot, live);
    assert.equal(snapshot.charterOffers?.length, 2);
    assert.equal(
      snapshot.charterOffers?.some((row) => row.id.startsWith('charter-offer:port:')),
      true,
    );
    assert.equal(snapshot.charterHubs?.[0]?.waitingPax, 22);
    assert.equal(snapshot.charterDemand?.[0]?.pressure, 4);
    assert.equal(snapshot.demandOrders?.[0]?.id, 'order-new');
    assert.equal(snapshot.portListings?.[0]?.id, 'listing-new');
    assert.equal(snapshot.portConcessions?.length, 1);
    assert.equal(snapshot.fuelHauls?.[0]?.id, 'haul-1');
    assert.equal(snapshot.tick, undefined);

    const loaded = {
      airports: [{ icao: 'KMIA' }],
      charterOffers: [{ id: 'charter-offer:1', status: 'available' }],
      charterHubs: [{ icao: 'KMIA', waitingPax: 40 }],
      charterDemand: [{ id: 'd1', pressure: 1 }],
      demandOrders: [{ id: 'order-old' }],
    } as unknown as Parameters<typeof overlayLiveEconomyOntoPulseSnapshot>[0];
    overlayLiveEconomyOntoPulseSnapshot(loaded, {
      airports: [],
      charterOffers: [],
      charterHubs: [],
      charterDemand: [],
      demandOrders: [],
    } as unknown as Parameters<typeof overlayLiveEconomyOntoPulseSnapshot>[1]);
    assert.equal(loaded.charterOffers?.length, 1);
    assert.equal(loaded.charterHubs?.[0]?.waitingPax, 40);
    assert.equal(loaded.demandOrders?.[0]?.id, 'order-old');
  });

  it('forms deterministic domestic and international offers from hub pools', () => {
    const a = createSeedEconomyWorld({ seed: 'charter-deterministic' });
    const b = createSeedEconomyWorld({ seed: 'charter-deterministic' });
    const countA = generateDailyCharterOffers(a, 0);
    const countB = generateDailyCharterOffers(b, 0);
    assert.ok(countA >= CHARTER_BOARD_MIN);
    assert.equal(countA, countB);
    assert.deepEqual(a.charterOffers, b.charterOffers);
    assert.ok((a.charterHubs?.length ?? 0) > 0);
    assert.ok(a.charterOffers!.some((offer) => offer.international));
    assert.ok(a.charterOffers!.some((offer) => !offer.international));
    assert.ok(
      a.charterOffers!.every(
        (offer) =>
          offer.groupSize >= 1 && offer.groupSize <= CHARTER_GROUP_SIZE_MAX,
      ),
    );
    assert.ok(
      a.charterOffers!.every(
        (offer) => offer.baggageKg === charterBaggageKg(offer.groupSize),
      ),
    );
    assert.ok(
      a.charterOffers!.every(
        (offer) => offer.distanceNm > 0 && offer.distanceNm <= charterMaxDistanceNm(),
      ),
    );
    assert.equal(generateDailyCharterOffers(a, 0), 0, 'full board must not dump again');
  });

  it('staggers offer life and recovers the board from Terminal pools after expiry', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-pool-refill' });
    const initial = generateDailyCharterOffers(world, 0);
    assert.ok(initial >= CHARTER_BOARD_MIN);
    const lives = new Set(
      world.charterOffers!.map((offer) => offer.expiresAtTick - offer.createdAtTick),
    );
    assert.ok(lives.size > 1, 'offer TTLs must not all match');

    const initialIds = new Set(world.charterOffers!.map((offer) => offer.id));
    for (const offer of world.charterOffers!) offer.expiresAtTick = world.tick;
    assert.equal(expireCharterOffers(world), initial);
    assert.ok(
      world.charterHubs!.some((hub) => hub.waitingPax >= 1 || hub.attractPax >= 1),
      'expiry must return passengers to Terminal pools',
    );

    const refilled = generateDailyCharterOffers(world, 0);
    assert.ok(refilled >= CHARTER_BOARD_MIN);
    const available = world.charterOffers!.filter((offer) => offer.status === 'available');
    assert.ok(available.length >= CHARTER_BOARD_MIN);
    assert.ok(available.every((offer) => !initialIds.has(offer.id)));
  });

  it('quotes by trip, distance, urgency, tier, and international status', () => {
    const base = quoteCharterPayUsd({
      distanceNm: 300,
      groupSize: 2,
      urgency: 'normal',
      tier: 'standard',
      international: false,
    });
    assert.ok(
      quoteCharterPayUsd({
        distanceNm: 900,
        groupSize: 2,
        urgency: 'normal',
        tier: 'standard',
        international: false,
      }) > base,
    );
    assert.ok(
      quoteCharterPayUsd({
        distanceNm: 300,
        groupSize: 8,
        urgency: 'urgent',
        tier: 'executive',
        international: true,
      }) > base,
    );
    // Linear through 12; √ taper after so narrow full-load stays freight-band.
    assert.equal(charterPayPaxWeight(12), 12);
    assert.ok(charterPayPaxWeight(48) < 30);
    assert.ok(charterPayPaxWeight(160) < 40);
    const twelve = quoteCharterPayUsd({
      distanceNm: 1_500,
      groupSize: 12,
      urgency: 'normal',
      tier: 'standard',
      international: false,
    });
    const narrow = quoteCharterPayUsd({
      distanceNm: 1_500,
      groupSize: 160,
      urgency: 'normal',
      tier: 'standard',
      international: false,
    });
    assert.ok(narrow > twelve);
    assert.ok(
      narrow < twelve * 3.5,
      `narrow pay ${narrow} should stay < 3.5× twelve-pax ${twelve}`,
    );
    // ≤12 band ~1.2–1.5× mid-gap freight (Sovereign-ish 10 pax @ 750–840 nm).
    const lightJet = quoteCharterPayUsd({
      distanceNm: 750,
      groupSize: 10,
      urgency: 'normal',
      tier: 'standard',
      international: false,
    });
    assert.ok(
      lightJet >= 4_500 && lightJet <= 5_800,
      `10-pax @750 nm pay ${lightJet} should sit ~1.3× freight leg (~$4–5k)`,
    );
  });

  it('bands group sizes so light, med, and narrow loads all appear', () => {
    const counts = { light: 0, med: 0, narrow: 0 };
    let seed = 1;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 400; i += 1) {
      const n = pickCharterGroupSize(rng, 200, 200);
      assert.ok(n >= 1 && n <= CHARTER_GROUP_SIZE_MAX);
      if (n <= 12) counts.light += 1;
      else if (n <= 48) counts.med += 1;
      else counts.narrow += 1;
    }
    // Deep pools: narrow majority, then med; light is residual.
    assert.ok(counts.narrow > 150, `narrow=${counts.narrow}`);
    assert.ok(counts.med > 80, `med=${counts.med}`);
    assert.ok(counts.light > 20 && counts.light < 120, `light=${counts.light}`);
  });

  it('prefers med loads when pools are mid-depth', () => {
    const counts = { light: 0, med: 0 };
    let seed = 99;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 200; i += 1) {
      const n = pickCharterGroupSize(rng, 30, 30);
      if (n <= 12) counts.light += 1;
      else counts.med += 1;
    }
    assert.ok(counts.med > counts.light, `med=${counts.med} light=${counts.light}`);
  });

  it('forms a wide group from a deep major pool without emptying the narrow shelf', () => {
    const counts = { wide: 0, narrower: 0 };
    let seed = 7;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i += 1) {
      const n = pickCharterGroupSize(rng, 440, 440);
      assert.ok(n >= 1 && n <= 440);
      if (n > CHARTER_NARROW_GROUP_MAX) counts.wide += 1;
      else counts.narrower += 1;
    }
    assert.ok(counts.wide > 40, `wide=${counts.wide}`);
    assert.ok(counts.narrower > counts.wide, `narrower=${counts.narrower} wide=${counts.wide}`);
  });

  it('puts only a wide cabin on a leg past the narrow range', () => {
    let seed = 3;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 80; i += 1) {
      const n = pickCharterGroupSize(rng, 440, 440, 6_000);
      assert.ok(n > CHARTER_NARROW_GROUP_MAX && n <= 440, `wide leg=${n}`);
    }
    assert.equal(pickCharterGroupSize(rng, 139, 400, 8_436), 0);
    assert.equal(pickCharterGroupSize(rng, 400, 10, 8_436), 0);
    const short = pickCharterGroupSize(() => 0.95, 440, 440, 400);
    assert.ok(short >= 1 && short <= 12, `short=${short}`);
  });

  it('scales only a P3 port lobby with the company roster', () => {
    assert.equal(portCharterLobbyRosterMult(0), 1);
    assert.equal(portCharterLobbyRosterMult(1), 1);
    assert.equal(portCharterLobbyCap(3, 450, 1), 450);
    assert.equal(portCharterLobbyCap(3, 450, 4), 1_800);
    assert.equal(portCharterLobbyCap(3, 450, 9), 1_800);
    assert.equal(portCharterLobbyCap(1, 450, 4), 12);
    assert.equal(portCharterLobbyCap(2, 450, 4), 48);
  });

  it('lets a four-pilot port lobby hold more than the airport cap', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-roster-lobby' });
    assert.ok(world.airports.some((ap) => ap.icao === 'KMIA'));
    world.portConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_va',
        leasePaidThroughTick: world.tick + 50_000,
        level: 3,
        pickupIcao: 'KMIA',
        roster: 4,
      },
    ];
    tickCharterPools(world);
    const seeded = world.charterHubs!.find((hub) => hub.icao === 'KMIA');
    assert.ok(seeded);
    const airportCap = seeded.capacityPax;
    seeded.waitingPax = airportCap;
    for (let i = 0; i < 48; i += 1) {
      world.tick += 1;
      tickCharterPools(world);
    }
    const after = world.charterHubs!.find((hub) => hub.icao === 'KMIA');
    assert.ok(after);
    assert.equal(after.capacityPax, airportCap);
    assert.ok(
      after.waitingPax > airportCap,
      `waiting=${after.waitingPax} cap=${airportCap}`,
    );
    assert.equal(listPortCharterDesk(world, 'KMIA', 3).capacityPax, airportCap * 4);

    const solo = createSeedEconomyWorld({ seed: 'charter-roster-solo' });
    solo.portConcessions = [
      {
        portId: 'USMIA',
        companyId: 'co_solo',
        leasePaidThroughTick: solo.tick + 50_000,
        level: 3,
        pickupIcao: 'KMIA',
        roster: 1,
      },
    ];
    tickCharterPools(solo);
    const soloHub = solo.charterHubs!.find((hub) => hub.icao === 'KMIA');
    assert.ok(soloHub);
    const soloCap = soloHub.capacityPax;
    soloHub.waitingPax = soloCap;
    for (let i = 0; i < 20; i += 1) {
      solo.tick += 1;
      tickCharterPools(solo);
    }
    const soloAfter = solo.charterHubs!.find((hub) => hub.icao === 'KMIA');
    assert.ok(soloAfter);
    assert.ok(soloAfter.waitingPax <= soloCap);
  });

  it('stamps the company roster onto that company port only', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-roster-stamp' });
    world.portConcessions = [
      {
        portId: 'USBOS',
        companyId: 'co_other',
        leasePaidThroughTick: world.tick + 1_000,
        level: 3,
        pickupIcao: 'KBOS',
        roster: 2,
      },
    ];
    const state = emptyMissionsStateV2();
    state.companyRoster = 4;
    state.playerPortConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'co_va',
        level: 3,
        claimedAtTick: 0,
        leasePaidThroughTick: world.tick + 1_000,
        lifetimeThroughputKg: 0,
      },
    ];
    syncWorldPortConcessions(world, state, { companyId: 'co_va' });
    const mine = world.portConcessions?.find((row) => row.companyId === 'co_va');
    const other = world.portConcessions?.find((row) => row.companyId === 'co_other');
    assert.equal(mine?.roster, 4);
    assert.equal(mine?.pickupIcao, 'SBGR');
    assert.equal(other?.roster, 2);
  });

  it('forms a few offers from the regular economy tick without a daily dump', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-tick-hook' });
    assert.equal(world.charterOffers?.length, 0);
    tickEconomy(world, { skipEventSpawn: true });
    const first = world.charterOffers?.length ?? 0;
    assert.ok(first > 0);
    assert.ok(first <= CHARTER_WARM_QUOTA_PER_TICK);
    assert.ok((world.charterHubs?.length ?? 0) > 0);
    const createdTicks = new Set(world.charterOffers!.map((o) => o.createdAtTick));
    for (let i = 0; i < 24; i += 1) {
      world.tick += 1;
      tickCharterEconomy(world);
    }
    assert.ok((world.charterOffers?.filter((o) => o.status === 'available').length ?? 0) >= 1);
    assert.ok(
      new Set(world.charterOffers!.map((o) => o.createdAtTick)).size >
        createdTicks.size,
      'later ticks must create offers at new times',
    );
  });

  it('staggers expires inside a same-tick form cohort', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-expire-stagger' });
    for (let i = 0; i < 12; i += 1) tickCharterEconomy(world);
    // Clear live board so the next form tick builds a fresh same-tick cohort.
    for (const offer of world.charterOffers ?? []) {
      if (offer.status === 'available') offer.expiresAtTick = world.tick;
    }
    expireCharterOffers(world);
    world.tick += 1;
    const formed = formCharterOffersForTick(world, { quota: 12 });
    assert.ok(formed >= 2, `formed=${formed}`);
    const cohort = world.charterOffers!.filter(
      (offer) => offer.createdAtTick === world.tick && offer.status === 'available',
    );
    assert.ok(cohort.length >= 2);
    const expires = new Set(cohort.map((offer) => offer.expiresAtTick));
    assert.equal(
      expires.size,
      cohort.length,
      'same-tick offers must not share one expiresAtTick',
    );
  });

  it('keeps a multi-day charter soak bounded without changing freight state', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-soak-14d' });
    const freightBefore = JSON.stringify({
      lots: world.lots,
      inventory: world.airports.map((airport) => airport.inventory),
      npcs: world.npcs,
      npcFlights: world.npcFlights,
    });

    // Warm the board, then sample across 3 days of continuous ticks.
    generateDailyCharterOffers(world, 0);
    const created = new Set<number>();
    const expires = new Set<number>();
    for (let step = 0; step < TICKS_PER_DAY * 3; step += 1) {
      world.tick = step;
      tickCharterEconomy(world);
      if (step % 16 !== 0 && step !== TICKS_PER_DAY * 3 - 1) continue;
      const available = world.charterOffers!.filter(
        (offer) => offer.status === 'available',
      );
      assert.ok(available.length <= CHARTER_BOARD_MAX);
      assert.ok(available.length >= Math.min(12, CHARTER_BOARD_MIN) || step < 8);
      for (const offer of available) {
        created.add(offer.createdAtTick);
        expires.add(offer.expiresAtTick);
        assert.ok(
          offer.groupSize >= 1 && offer.groupSize <= CHARTER_GROUP_SIZE_MAX,
        );
        assert.equal(offer.baggageKg, charterBaggageKg(offer.groupSize));
      }
      assert.ok(world.charterOffers!.length <= CHARTER_BOARD_MAX * 3);
    }
    assert.ok(created.size > 1);
    assert.ok(expires.size > 1);

    assert.equal(
      JSON.stringify({
        lots: world.lots,
        inventory: world.airports.map((airport) => airport.inventory),
        npcs: world.npcs,
        npcFlights: world.npcFlights,
      }),
      freightBefore,
    );
  });

  it('warm burst can deepen the board past the legacy 600 soft ceiling', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-board-deepen' });
    const formed = generateDailyCharterOffers(world, 0);
    const available = (world.charterOffers ?? []).filter(
      (offer) => offer.status === 'available',
    );
    assert.ok(formed > 600, `expected deep warm board, formed=${formed}`);
    assert.ok(
      available.length > 600,
      `available=${available.length} should clear legacy 600 cap`,
    );
    assert.ok(available.length <= CHARTER_BOARD_MAX);
  });

  it('spreads international offers across many origin countries', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-intl-fair' });
    generateDailyCharterOffers(world, 0);
    const intl = (world.charterOffers ?? []).filter(
      (offer) => offer.status === 'available' && offer.international,
    );
    assert.ok(intl.length >= 40, `intl offers=${intl.length}`);
    const originCountries = new Set(
      intl.map((offer) => {
        const ap = world.airports.find((row) => row.icao === offer.originIcao);
        return countryIdFromRegion(ap?.region ?? '');
      }),
    );
    originCountries.delete('');
    assert.ok(
      originCountries.size >= 8,
      `intl origin countries=${originCountries.size} (${[...originCountries].slice(0, 12).join(',')})`,
    );
  });

  it('forms intl charter ODs from the dynamic lane graph', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-intl-lanes' });
    assert.ok(
      (world.internationalLanes?.length ?? 0) >= 90,
      'seed world needs a live intl lane graph',
    );
    generateDailyCharterOffers(world, 0);
    const laneOds = new Set(
      (world.internationalLanes ?? []).map(
        (lane) =>
          `${lane.originIcao.trim().toUpperCase()}>${lane.destIcao.trim().toUpperCase()}`,
      ),
    );
    const intl = (world.charterOffers ?? []).filter(
      (offer) => offer.status === 'available' && offer.international,
    );
    assert.ok(intl.length >= 20, `intl offers=${intl.length}`);
    const onGraph = intl.filter((offer) =>
      laneOds.has(
        `${offer.originIcao.trim().toUpperCase()}>${offer.destIcao.trim().toUpperCase()}`,
      ),
    ).length;
    assert.ok(
      onGraph / intl.length >= 0.85,
      `intl on lane graph ${onGraph}/${intl.length}`,
    );
  });

  it('rotates domestic origin sample across ticks instead of only top hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-dom-rotate' });
    // Warm pools without dumping the full board target.
    for (let i = 0; i < 8; i += 1) tickCharterEconomy(world);
    for (const offer of world.charterOffers ?? []) {
      if (offer.status === 'available') offer.expiresAtTick = world.tick;
    }
    expireCharterOffers(world);

    const origins = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
      world.tick += 1;
      formCharterOffersForTick(world, { quota: 16 });
      for (const offer of world.charterOffers ?? []) {
        if (
          offer.status === 'available' &&
          !offer.international &&
          offer.createdAtTick === world.tick
        ) {
          origins.add(offer.originIcao.toUpperCase());
        }
      }
      for (const offer of world.charterOffers ?? []) {
        if (offer.status === 'available') offer.expiresAtTick = world.tick + 1;
      }
      world.tick += 1;
      expireCharterOffers(world);
    }
    assert.ok(
      origins.size >= 40,
      `domestic origin diversity across rotated ticks=${origins.size}`,
    );
  });

  it('returns passengers to hubs on expiry and reduces OD heat only through settlement', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-pressure' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const demand = world.charterDemand!.find((row) => row.id === offer.demandId)!;
    const originHub = world.charterHubs!.find((hub) => hub.icao === offer.originIcao)!;
    const waitingBeforeExpire = originHub.waitingPax;
    const pressureAtOffer = demand.pressure;
    const freightSnapshot = JSON.stringify({
      lots: world.lots,
      inventory: world.airports.map((ap) => ap.inventory),
      npcs: world.npcs,
    });

    world.tick = offer.expiresAtTick;
    assert.ok(expireCharterOffers(world) >= 1);
    assert.equal(offer.status, 'expired');
    assert.ok(originHub.waitingPax >= waitingBeforeExpire + offer.groupSize - 0.001);
    assert.ok(demand.pressure > pressureAtOffer);
    assert.equal(
      JSON.stringify({
        lots: world.lots,
        inventory: world.airports.map((ap) => ap.inventory),
        npcs: world.npcs,
      }),
      freightSnapshot,
    );

    generateDailyCharterOffers(world, 1);
    const open = world.charterOffers!.find((row) => row.status === 'available')!;
    const mission = reserveCharterOffer(world, {
      offerId: open.id,
      missionId: 'msn_charter_1',
    });
    assert.equal(mission.missionType, 'charter');
    assert.equal(mission.pax, open.groupSize);
    assert.equal(mission.baggageKg, open.baggageKg);
    assert.equal(mission.cargoKg, 0);
    const beforeSettle = world.charterDemand!.find((row) => row.id === open.demandId)!.pressure;
    const result = settleCharterMission(world, mission);
    assert.equal(result.settlement.settlementType, 'charter');
    assert.equal(result.settlement.baggageKg, open.baggageKg);
    assert.equal(result.walletCreditUsd, open.payUsd);
    assert.ok(result.settlement.pressureAfter < beforeSettle);
    assert.equal(open.status, 'completed');
  });

  it('cancels an indivisible group without touching freight stock', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-cancel' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const freightBefore = JSON.stringify({
      lots: world.lots,
      inventory: world.airports.map((ap) => ap.inventory),
      npcs: world.npcs,
    });
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_cancel',
    });
    const groupSize = offer.groupSize;
    const baggageKg = offer.baggageKg;
    const cancelled = cancelCharterMission(world, mission);
    assert.equal(cancelled.mission.status, 'cancelled');
    assert.equal(cancelled.releasedToAvailable, true);
    assert.equal(offer.status, 'available');
    assert.equal(offer.missionId, undefined);
    assert.equal(offer.groupSize, groupSize);
    assert.equal(offer.baggageKg, baggageKg);
    assert.equal(
      JSON.stringify({
        lots: world.lots,
        inventory: world.airports.map((ap) => ap.inventory),
        npcs: world.npcs,
      }),
      freightBefore,
    );

    const withdrawnOffer = world.charterOffers!.find(
      (row) => row.status === 'available' && row.id !== offer.id,
    )!;
    const withdrawnMission = reserveCharterOffer(world, {
      offerId: withdrawnOffer.id,
      missionId: 'msn_charter_withdrawn',
    });
    const withdrawn = cancelCharterMission(world, withdrawnMission, {
      cancelOffer: true,
    });
    assert.equal(withdrawn.releasedToAvailable, false);
    assert.equal(withdrawnOffer.status, 'cancelled');

    const staleMission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_stale',
    });
    const pressure = world.charterDemand!.find((row) => row.id === offer.demandId)!.pressure;
    const stale = cancelCharterMission(world, staleMission, {
      cancelledAtTick: offer.expiresAtTick,
    });
    assert.equal(stale.releasedToAvailable, false);
    assert.equal(offer.status, 'expired');
    assert.ok(
      world.charterDemand!.find((row) => row.id === offer.demandId)!.pressure >
        pressure,
    );
  });

  it('requires exact charter passengers and baggage in the OFP', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-ofp-exact' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers!.find((row) => row.groupSize >= 2)!;
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_ofp',
      aircraftClassId: 'light_jet',
      airframeTypeId: 'fsreborn-phenom-300e',
      rolesPackRelPath: 'profiles/ofp/fsreborn-phenom-300e.json',
    });
    const check = compareMissionIntentToOfp(mission, normalizeOfpExpectation({
      source: 'simbrief',
      originIcao: offer.originIcao,
      destIcao: offer.destIcao,
      icao: 'E55P',
      fuel: { unit: 'kg', total: 1000 },
      loadSheet: {
        unit: 'kg',
        blockFuel: 1000,
        passengerCount: offer.groupSize - 1,
        baggage: offer.baggageKg + 100,
      },
    }));
    assert.equal(check.verdict, 'fail');
    assert.ok(check.findings.some((row) => row.code === 'INTENT_PAX_MISMATCH'));
    assert.ok(check.findings.some((row) => row.code === 'INTENT_CARGO_MISMATCH'));
  });

  it('settles through the persist command with charter ledger isolation', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-command-settle' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const state = emptyMissionsStateV2();
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_command',
    });
    state.missions.push(mission);
    const freightBefore = JSON.stringify({
      lots: world.lots,
      inventory: world.airports.map((airport) =>
        Object.fromEntries(
          Object.entries(airport.inventory).filter(([commodity]) => commodity !== 'fuel'),
        ),
      ),
    });
    const result = executeSettleFlight(world, state, {
      missionId: mission.id,
      skipMinAirborneGate: true,
    });
    assert.equal(result.kind, 'applied');
    if (result.kind !== 'applied') return;
    assert.equal(result.result.settlement.settlementType, 'charter');
    assert.equal(result.result.mission.status, 'settled');
    assert.ok(
      state.ledger?.some(
        (entry) =>
          entry.kind === 'charter_payout' && entry.missionId === mission.id,
      ),
    );
    assert.equal(
      JSON.stringify({
        lots: world.lots,
        inventory: world.airports.map((airport) =>
          Object.fromEntries(
            Object.entries(airport.inventory).filter(([commodity]) => commodity !== 'fuel'),
          ),
        ),
      }),
      freightBefore,
    );
  });

  it('credits Class Ops on charter settle without Cargo Ops / Dry cleans', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-class-ops' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const state = emptyMissionsStateV2();
    assert.ok(state.classOps);
    const hoursBefore = state.classOps.classes.light_jet.hours;
    const cleansBefore = state.classOps.classes.light_jet.cleans;
    const cargoSnap = JSON.stringify(state.cargoOps);
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_class_ops',
      aircraftClassId: 'light_jet',
    });
    state.missions.push(mission);
    const result = executeSettleFlight(world, state, {
      missionId: mission.id,
      skipMinAirborneGate: true,
      flightScore: { earned: 45, max: 51, pct: 90, categories: [] },
    });
    assert.equal(result.kind, 'applied');
    if (result.kind !== 'applied') return;
    assert.ok(
      (result.result.classOpsDeltas?.length ?? 0) > 0,
      'expected Class Ops deltas on charter settle',
    );
    assert.equal(result.result.cargoOpsDeltas, undefined);
    assert.ok(state.classOps);
    assert.ok(state.classOps.classes.light_jet.hours > hoursBefore);
    assert.equal(state.classOps.classes.light_jet.cleans, cleansBefore + 1);
    assert.equal(
      JSON.stringify(state.cargoOps),
      cargoSnap,
      'Charter must not touch Cargo Ops / Dry cleans',
    );
  });

  it('applies late penalties to the whole charter without splitting passengers', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-late-settle' });
    generateDailyCharterOffers(world, 0);
    const offer = world.charterOffers![0]!;
    const state = emptyMissionsStateV2();
    const mission = reserveCharterOffer(world, {
      offerId: offer.id,
      missionId: 'msn_charter_late',
    });
    state.missions.push(mission);
    world.tick = mission.deadlineTick + 4;

    const result = executeSettleFlight(world, state, {
      missionId: mission.id,
      skipMinAirborneGate: true,
    });
    assert.equal(result.kind, 'applied');
    if (result.kind !== 'applied') return;
    assert.equal(result.result.settlement.settlementType, 'charter');
    assert.equal(result.result.mission.pax, offer.groupSize);
    assert.equal(result.result.mission.baggageKg, offer.baggageKg);
    assert.ok(result.result.settlement.penaltyUsd > 0);
    assert.ok(result.result.walletCreditUsd < offer.payUsd);
  });

  it('forms from waiting/attract imbalance rather than a fixed scripted OD list', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-imbalance' });
    generateDailyCharterOffers(world, 0);
    for (const offer of world.charterOffers!.filter((row) => row.status === 'available')) {
      offer.expiresAtTick = world.tick;
    }
    expireCharterOffers(world);
    const waitingBefore = world.charterHubs!.reduce((sum, hub) => sum + hub.waitingPax, 0);
    const formed = formCharterOffersForTick(world, { quota: 8 });
    assert.ok(formed > 0);
    const waitingAfter = world.charterHubs!.reduce((sum, hub) => sum + hub.waitingPax, 0);
    assert.ok(waitingAfter < waitingBefore);
  });

  it('keeps large-country domestic offers visible for pilot-country filters', () => {
    const seeds = ['charter-br-share', 'live-like', 'a', 'b', 'c'];
    for (const seed of seeds) {
      const world = createSeedEconomyWorld({ seed });
      for (let i = 0; i < 96; i += 1) tickCharterEconomy(world);
      const offers = (world.charterOffers ?? []).filter(
        (offer) =>
          offer.status === 'available' && world.tick < offer.expiresAtTick,
      );
      const brDomestic = offers.filter((offer) => {
        if (offer.international) return false;
        const origin = world.airports.find((ap) => ap.icao === offer.originIcao);
        return countryIdFromRegion(origin?.region ?? '') === 'BR';
      });
      const domestic = offers.filter((offer) => !offer.international);
      const byCountry = new Map<string, number>();
      for (const offer of domestic) {
        const origin = world.airports.find((ap) => ap.icao === offer.originIcao);
        const country = countryIdFromRegion(origin?.region ?? '');
        byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
      }
      const topShare = Math.max(0, ...byCountry.values());
      assert.ok(
        domestic.length >= Math.floor(offers.length * 0.28),
        `seed ${seed}: domestic shelf too thin (${domestic.length}/${offers.length})`,
      );
      assert.ok(
        brDomestic.length >= 10,
        `seed ${seed}: expected BR domestic share, got ${brDomestic.length} of ${offers.length}`,
      );
      assert.ok(
        topShare <= Math.max(28, Math.ceil(domestic.length * 0.28)),
        `seed ${seed}: one country monopolized domestic board (${topShare}/${domestic.length})`,
      );
    }
  });

  it('exposes read-only Terminal pool view for Inventory UI', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-pool-view' });
    generateDailyCharterOffers(world, 0);
    const airport = world.airports.find((row) => row.icao === 'SBSP') ?? world.airports[0]!;
    const view = readCharterHubPoolView(world, airport);
    assert.ok(view.capacityPax >= 8);
    assert.ok(view.waitingPax >= 0);
    assert.ok(view.attractPax >= 0);
    assert.ok(view.waitingFillPct >= 0 && view.waitingFillPct <= 1);
    assert.ok(view.openOffersFrom + view.openOffersTo >= 0);
  });

  it('scales the live charter board with hub count', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-board-scale' });
    generateDailyCharterOffers(world, 0);
    const available = (world.charterOffers ?? []).filter(
      (offer) =>
        offer.status === 'available' && world.tick < offer.expiresAtTick,
    ).length;
    assert.ok(
      available >= 1_200,
      `expected commodity-like worldwide charter board, got ${available}`,
    );
    assert.ok(available <= CHARTER_BOARD_MAX);
  });

  it('keeps a concession lobby off the world charter board', () => {
    const world = createSeedEconomyWorld({ seed: 'port-charter-lobby' });
    world.portConcessions = [
      {
        portId: 'BRSSZ',
        companyId: 'local',
        leasePaidThroughTick: world.tick + 10_000,
        level: 1,
        pickupIcao: 'SBGR',
      },
    ];
    generateDailyCharterOffers(world, 0);
    assert.ok(
      (world.charterOffers ?? [])
        .filter((offer) => offer.status === 'available')
        .every((offer) => offer.originIcao !== 'SBGR'),
    );
    const desk = listPortCharterDesk(world, 'SBGR', 1);
    assert.ok(desk.capacityPax <= 12);
    assert.ok(desk.waitingPax <= desk.capacityPax);
    assert.ok(desk.waitingPax > 0);
  });

  it('keeps the port charter desk from filling with long haul', () => {
    const row = (dest: string, nm: number, attract: number, pay: number) => ({
      destIcao: dest,
      distanceNm: nm,
      attractPax: attract,
      payUsd: pay,
    });
    const far = [
      row('AAAA', 4_200, 900, 80_000),
      row('BBBB', 6_000, 880, 70_000),
      row('CCCC', 3_100, 860, 60_000),
      row('DDDD', 2_500, 840, 50_000),
    ];
    const mid = [
      row('MMMM', 1_200, 100, 9_000),
      row('NNNN', 800, 90, 8_000),
      row('OOOO', 1_600, 80, 7_000),
      row('PPPP', 900, 70, 6_000),
      row('QQQQ', 1_100, 60, 5_000),
      row('RRRR', 700, 50, 4_000),
    ];
    const near = [
      row('NEAR', 220, 10, 1_000),
      row('NERO', 400, 9, 900),
      row('NERI', 180, 8, 800),
      row('NERE', 300, 7, 700),
    ];
    const closed = pickPortCharterDeskRows([...far, ...mid, ...near], {
      wideRange: false,
    });
    assert.equal(closed.length, PORT_CHARTER_DESK_LIMIT);
    assert.equal(closed.filter((item) => item.distanceNm <= 500).length, 3);
    assert.equal(closed.filter((item) => item.distanceNm > CHARTER_MAX_DISTANCE_NM).length, 0);
    assert.equal(
      closed.filter(
        (item) => item.distanceNm > 500 && item.distanceNm <= CHARTER_MAX_DISTANCE_NM,
      ).length,
      5,
    );

    const open = pickPortCharterDeskRows([...far, ...mid, ...near], {
      wideRange: true,
    });
    assert.equal(open.filter((item) => item.distanceNm > CHARTER_MAX_DISTANCE_NM).length, 2);
    assert.equal(
      open.filter(
        (item) => item.distanceNm > 500 && item.distanceNm <= CHARTER_MAX_DISTANCE_NM,
      ).length,
      3,
    );
    assert.equal(open.filter((item) => item.distanceNm <= 500).length, 3);

    const thinNear = pickPortCharterDeskRows(
      [row('NEAR', 220, 10, 1_000), ...far, ...mid],
      { wideRange: true },
    );
    assert.equal(thinNear.filter((item) => item.distanceNm <= 500).length, 1);
    assert.equal(thinNear.filter((item) => item.distanceNm > CHARTER_MAX_DISTANCE_NM).length, 2);

    const noFar = pickPortCharterDeskRows([...mid, ...near], { wideRange: true });
    assert.equal(
      noFar.filter(
        (item) => item.distanceNm > 500 && item.distanceNm <= CHARTER_MAX_DISTANCE_NM,
      ).length,
      5,
    );
    assert.equal(noFar.filter((item) => item.distanceNm <= 500).length, 3);
  });

  it('allows medium piston and narrowbody classes on the shared charter board', () => {
    assert.equal(isCharterEligibleAircraftClass('light_ga'), true);
    assert.equal(isCharterEligibleAircraftClass('light_turboprop'), true);
    assert.equal(isCharterEligibleAircraftClass('light_jet'), true);
    assert.equal(isCharterEligibleAircraftClass('medium_piston'), true);
    assert.equal(isCharterEligibleAircraftClass('narrow_freighter'), true);
    assert.equal(isCharterEligibleAircraftClass('wide_freighter'), true);
  });

  it('drops old expired charter offers instead of keeping a 2-day corpse pile', () => {
    const world = createSeedEconomyWorld({ seed: 'charter-prune-dead' });
    generateDailyCharterOffers(world, 0);
    world.tick = 500;
    const live = (world.charterOffers ?? []).find(
      (offer) => offer.status === 'available',
    );
    assert.ok(live);
    world.charterOffers!.push({
      ...live!,
      id: 'expired-old',
      status: 'expired',
      createdAtTick: world.tick - TICKS_PER_DAY * 3,
      expiresAtTick: world.tick - (TICKS_PER_DAY + 1),
    });
    world.charterOffers!.push({
      ...live!,
      id: 'expired-recent',
      status: 'expired',
      createdAtTick: world.tick - 10,
      expiresAtTick: world.tick - 2,
    });
    world.charterOffers!.push({
      ...live!,
      id: 'completed-drop',
      status: 'completed',
      createdAtTick: world.tick - 5,
      expiresAtTick: world.tick + 40,
    });
    tickCharterEconomy(world);
    const ids = new Set((world.charterOffers ?? []).map((offer) => offer.id));
    assert.equal(ids.has('expired-old'), false);
    assert.equal(ids.has('completed-drop'), false);
    assert.equal(ids.has('expired-recent'), true);
  });
});
