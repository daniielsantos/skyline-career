import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHARTER_BOARD_MAX,
  CHARTER_BOARD_MIN,
  CHARTER_GROUP_SIZE_MAX,
  CHARTER_MAX_DISTANCE_NM,
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
  reserveCharterOffer,
  settleCharterMission,
  tickCharterEconomy,
  tickEconomy,
  TICKS_PER_DAY,
} from './index.js';

describe('Charter economy', () => {
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
        (offer) => offer.distanceNm > 0 && offer.distanceNm <= CHARTER_MAX_DISTANCE_NM,
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
        baggage: offer.baggageKg + 2,
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

  it('allows medium piston and narrowbody classes on the shared charter board', () => {
    assert.equal(isCharterEligibleAircraftClass('light_ga'), true);
    assert.equal(isCharterEligibleAircraftClass('light_turboprop'), true);
    assert.equal(isCharterEligibleAircraftClass('light_jet'), true);
    assert.equal(isCharterEligibleAircraftClass('medium_piston'), true);
    assert.equal(isCharterEligibleAircraftClass('narrow_freighter'), true);
    assert.equal(isCharterEligibleAircraftClass('wide_freighter'), false);
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
