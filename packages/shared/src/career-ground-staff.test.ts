/**
 * Ground staff hire / slots / logistics + yard perks + grades.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  effectMultForPerk,
  fireGroundStaffMember,
  GROUND_STAFF_LOGISTICS_MULT,
  GROUND_STAFF_SOLID_MID_PCT,
  GROUND_STAFF_YARD_HOLD_MULT,
  groundStaffRosterSlotsFree,
  hireGroundStaffCandidate,
  logisticsMultForWarehouse,
  normalizeGroundStaffState,
  pickGroundStaffGrade,
  refreshGroundStaffHirePool,
  rollGroundStaffSkillPct,
  settleGroundStaffSalaries,
  whOpsShippedMultForWarehouse,
  yardHoldMultForHub,
} from './career-ground-staff.js';
import {
  buyWarehouseAtPickupHub,
  quoteWarehouseTier2UpgradeUsd,
  quoteWarehouseUpgradeUsd,
  upgradeWarehouse,
  upgradeWarehouseToTier2,
  warehouseInboundTransferTicks,
  WAREHOUSE_T2_SHIPPED_KG,
  WAREHOUSE_T3_SHIPPED_KG,
} from './career-warehouse.js';
import { recordWarehouseShipmentKg } from './career-warehouse-stock.js';
import {
  buyPortListing,
  ensurePortListings,
  listPortListings,
  settlePortYardHoldFees,
} from './career-ports.js';
import { createSeedEconomyWorld } from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';
import { TICKS_PER_DAY } from './career-clock.js';
import type {
  CareerMissionsState,
  GroundStaffPerkId,
} from './types/career-economy.js';
import type { CareerEconomyWorld } from './career-economy.js';

function liveWh(state: CareerMissionsState) {
  return state.playerWarehouses!.warehouses[0]!;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inject a hire-desk candidate with the requested perk, then hire. */
function hirePerk(
  state: CareerMissionsState,
  world: CareerEconomyWorld & { seed?: string },
  warehouseId: string,
  perkId: GroundStaffPerkId,
  opts: { effectMult?: number; grade?: 'ace' | 'solid' | 'capable' | 'green' } = {},
) {
  refreshGroundStaffHirePool(state, world, { hubIcao: 'SBGR', force: true });
  const roster = state.groundStaff!;
  const id = `gscand_${perkId}_${Math.floor(Math.random() * 1e6)}`;
  const grade = opts.grade ?? 'solid';
  const skillPct = GROUND_STAFF_SOLID_MID_PCT;
  const effectMult =
    opts.effectMult ??
    (perkId === 'logistics'
      ? GROUND_STAFF_LOGISTICS_MULT
      : perkId === 'yard'
        ? GROUND_STAFF_YARD_HOLD_MULT
        : effectMultForPerk(perkId, skillPct));
  const salaryUsdPerDay = 65;
  roster.hirePoolByHub = {
    ...(roster.hirePoolByHub ?? {}),
    SBGR: [
      {
        id,
        displayName: `Test ${perkId}`,
        perkId,
        grade,
        skillPct,
        effectMult,
        salaryUsdPerDay,
        hireUsd: salaryUsdPerDay * 2,
      },
      ...(roster.hirePoolByHub?.SBGR ?? []).filter((c) => c.perkId !== perkId),
    ],
  };
  state.groundStaff = roster;
  return hireGroundStaffCandidate(state, world, {
    warehouseId,
    candidateId: id,
  });
}

describe('career ground staff', () => {
  it('rolls skillPct inside grade band with distinct effectMult', () => {
    const low = mulberry32(1);
    const high = mulberry32(99);
    const grade = 'solid';
    const a = rollGroundStaffSkillPct(grade, low);
    const b = rollGroundStaffSkillPct(grade, high);
    assert.ok(a >= 75 && a <= 89);
    assert.ok(b >= 75 && b <= 89);
    assert.notEqual(
      effectMultForPerk('logistics', a),
      effectMultForPerk('logistics', b),
    );
    const midLog = effectMultForPerk('logistics', GROUND_STAFF_SOLID_MID_PCT);
    assert.ok(midLog > 0.5 && midLog < 0.6);
  });

  it('pickGroundStaffGrade respects weight table over many rolls', () => {
    const rng = mulberry32(42);
    const counts = { ace: 0, solid: 0, capable: 0, green: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[pickGroundStaffGrade(rng)]++;
    }
    assert.ok(counts.ace < 150);
    assert.ok(counts.capable > 250);
    assert.ok(counts.solid > 200);
  });

  it('migrates legacy member to solid mid + frozen constants', () => {
    const normalized = normalizeGroundStaffState({
      members: [
        {
          id: 'gs_legacy',
          displayName: 'Old Hand',
          warehouseId: 'wh_1',
          hubIcao: 'SBGR',
          perkId: 'logistics',
          salaryUsdPerDay: 70,
          hiredAtTick: 0,
        },
      ],
    });
    const m = normalized.members[0]!;
    assert.equal(m.grade, 'solid');
    assert.equal(m.skillPct, GROUND_STAFF_SOLID_MID_PCT);
    assert.equal(m.effectMult, GROUND_STAFF_LOGISTICS_MULT);
  });

  it('hires logistics into T1 slot and shortens port→WH transfer', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-hire-logistics' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsHire',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;

    assert.equal(groundStaffRosterSlotsFree(state, whId), 1);
    assert.equal(logisticsMultForWarehouse(state, whId), 1);

    const hired = hirePerk(state, world, whId, 'logistics');
    assert.equal(hired.member.perkId, 'logistics');
    assert.equal(hired.member.grade, 'solid');
    assert.equal(
      logisticsMultForWarehouse(state, whId),
      GROUND_STAFF_LOGISTICS_MULT,
    );
    assert.equal(groundStaffRosterSlotsFree(state, whId), 0);
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'ground_staff_hire'));

    const baseTicks = warehouseInboundTransferTicks(2_000, 1);
    const fastTicks = warehouseInboundTransferTicks(
      2_000,
      GROUND_STAFF_LOGISTICS_MULT,
    );
    assert.ok(fastTicks < baseTicks);
    assert.ok(fastTicks >= 2);
  });

  it('uses member effectMult for logistics and yard (not global constants)', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-custom-mult' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsCustom',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    liveWh(state).lifetimeShippedKg = WAREHOUSE_T2_SHIPPED_KG;
    upgradeWarehouseToTier2(state, world, whId);

    hirePerk(state, world, whId, 'logistics', {
      grade: 'ace',
      effectMult: 0.48,
    });
    hirePerk(state, world, whId, 'yard', { grade: 'ace', effectMult: 0.74 });
    assert.equal(logisticsMultForWarehouse(state, whId), 0.48);
    assert.equal(yardHoldMultForHub(state, 'SBGR'), 0.74);
  });

  it('hires yard + logistics on T2 and reduces yard hold debit', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-yard-hold' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsYard',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    liveWh(state).lifetimeShippedKg = WAREHOUSE_T2_SHIPPED_KG;
    upgradeWarehouseToTier2(state, world, whId);
    assert.equal(groundStaffRosterSlotsFree(state, whId), 2);

    hirePerk(state, world, whId, 'logistics');
    hirePerk(state, world, whId, 'yard');
    assert.equal(yardHoldMultForHub(state, 'SBGR'), GROUND_STAFF_YARD_HOLD_MULT);
    assert.equal(groundStaffRosterSlotsFree(state, whId), 0);

    state.portPickups = [
      {
        id: 'portpk_yard',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 2_000,
        avgCostUsdPerKg: 1,
        purchasedAtTick: world.tick,
      },
    ];
    const fromTick = world.tick;
    const toTick = world.tick + TICKS_PER_DAY;
    const before = state.walletUsd;
    const fees = settlePortYardHoldFees(state, { fromTick, toTick });
    assert.equal(fees.daysCharged, 1);
    const full = Math.round(2_000 * 0.05 * 100) / 100;
    const expected = Math.round(full * GROUND_STAFF_YARD_HOLD_MULT * 100) / 100;
    assert.equal(fees.requestedUsd, expected);
    assert.ok(fees.requestedUsd < full);
    assert.equal(state.walletUsd, before - fees.debitUsd);
  });

  it('rejects duplicate perk and unlocks three seats at T3', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-slots-t3' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsSlots',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    liveWh(state).lifetimeShippedKg = WAREHOUSE_T3_SHIPPED_KG;
    upgradeWarehouse(state, world, whId);
    assert.equal(liveWh(state).tier, 2);
    liveWh(state).lifetimeShippedKg = WAREHOUSE_T3_SHIPPED_KG;
    upgradeWarehouse(state, world, whId);
    assert.equal(liveWh(state).tier, 3);
    assert.equal(groundStaffRosterSlotsFree(state, whId), 3);

    hirePerk(state, world, whId, 'logistics');
    assert.throws(
      () => hirePerk(state, world, whId, 'logistics'),
      /Already have Logistics/,
    );
    hirePerk(state, world, whId, 'yard');
    assert.equal(groundStaffRosterSlotsFree(state, whId), 1);
  });

  it('charges daily ground staff salary and allows fire', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-salary' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsPay',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    const hired = hirePerk(state, world, whId, 'logistics');
    const walletAfterHire = state.walletUsd;
    const fromTick = world.tick;
    const toTick = world.tick + TICKS_PER_DAY;
    const pay = settleGroundStaffSalaries(state, { fromTick, toTick });
    assert.equal(pay.daysCharged, 1);
    assert.ok(pay.debitUsd > 0);
    assert.ok(state.walletUsd < walletAfterHire);
    assert.ok(
      (state.ledger ?? []).some((e) => e.kind === 'ground_staff_salary'),
    );

    fireGroundStaffMember(state, hired.member.id);
    assert.equal(state.groundStaff?.members.length, 0);
    assert.equal(logisticsMultForWarehouse(state, whId), 1);
  });

  it('buyPortListing applies logistics mult when staff is hired', () => {
    const world = createSeedEconomyWorld({ seed: 'wh-inbound-settle' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsBuy',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    hirePerk(state, world, whId, 'logistics');

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.commodityId === 'general' &&
        l.availableKg >= 500,
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_gs_logistics',
        portId: 'BRSSZ',
        commodityId: 'general',
        availableKg: 5_000,
        unitPriceUsd: 1,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
      listing = listPortListings(world, 'BRSSZ').find(
        (l) => l.id === 'portlot_gs_logistics',
      );
    }
    assert.ok(listing);
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 500,
    });
    assert.ok(bought.inboundTransfer);
    const baseTicks = warehouseInboundTransferTicks(500, 1);
    const expectedTicks = warehouseInboundTransferTicks(
      500,
      GROUND_STAFF_LOGISTICS_MULT,
    );
    assert.equal(
      bought.inboundTransfer!.readyAtTick -
        bought.inboundTransfer!.purchasedAtTick,
      expectedTicks,
    );
    assert.ok(expectedTicks < baseTicks);
  });

  it('procurement lowers port buy debit; demand_desk and wh_ops curves mid-solid', () => {
    assert.ok(effectMultForPerk('procurement', 40) <= 0.99);
    assert.ok(effectMultForPerk('procurement', 99) >= 0.94);
    assert.ok(effectMultForPerk('procurement', 99) < effectMultForPerk('procurement', 40));
    assert.ok(effectMultForPerk('demand_desk', 40) >= 1.02);
    assert.ok(effectMultForPerk('demand_desk', 99) <= 1.08);
    assert.ok(effectMultForPerk('demand_desk', 99) > effectMultForPerk('demand_desk', 40));
    assert.ok(effectMultForPerk('wh_ops', 40) <= 0.97);
    assert.ok(effectMultForPerk('wh_ops', 99) >= 0.88);
    assert.ok(effectMultForPerk('wh_ops', 99) < effectMultForPerk('wh_ops', 40));

    const world = createSeedEconomyWorld({ seed: 'gs-proc-buy' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsProc',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    hirePerk(state, world, whId, 'procurement', { effectMult: 0.97 });

    ensurePortListings(world);
    world.portListings = world.portListings ?? [];
    world.portListings.push({
      id: 'portlot_gs_proc',
      portId: 'BRSSZ',
      commodityId: 'general',
      availableKg: 5_000,
      unitPriceUsd: 2,
      allocatedHubIcao: 'SBGR',
      arrivedAtTick: world.tick,
      expiresAtTick: world.tick + 100,
      status: 'open',
    });
    const before = state.walletUsd;
    const bought = buyPortListing(state, world, {
      listingId: 'portlot_gs_proc',
      kg: 1_000,
    });
    assert.equal(bought.unitPriceUsd, 1.94);
    assert.equal(bought.debitUsd, 1_940);
    assert.equal(state.walletUsd, before - 1_940);
  });

  it('wh_ops discounts upgrade CAPEX and boosts shipped credit', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-wh-ops' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsWhOps',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    const whId = buyWarehouseAtPickupHub(state, world, 'SBGR').warehouse.id;
    hirePerk(state, world, whId, 'wh_ops', {
      grade: 'solid',
      effectMult: 0.9,
    });
    // Keep skill mid so shipped mult ≈ 1.05
    const member = state.groundStaff!.members.find((m) => m.perkId === 'wh_ops')!;
    member.skillPct = GROUND_STAFF_SOLID_MID_PCT;

    const base = quoteWarehouseTier2UpgradeUsd(world, 'SBGR');
    const discounted = quoteWarehouseUpgradeUsd(world, liveWh(state), state);
    assert.ok(discounted != null);
    assert.equal(discounted, Math.round(base * 0.9 * 100) / 100);

    liveWh(state).lifetimeShippedKg = WAREHOUSE_T2_SHIPPED_KG;
    const walletBefore = state.walletUsd;
    upgradeWarehouse(state, world, whId);
    assert.equal(liveWh(state).tier, 2);
    assert.equal(state.walletUsd, walletBefore - discounted!);

    const shipMult = whOpsShippedMultForWarehouse(state, whId);
    assert.ok(shipMult > 1);
    const beforeShip = liveWh(state).lifetimeShippedKg ?? 0;
    recordWarehouseShipmentKg(state, {
      warehouseId: whId,
      kg: 1_000,
      creditMult: shipMult,
    });
    const credited = (liveWh(state).lifetimeShippedKg ?? 0) - beforeShip;
    assert.ok(credited > 1_000);
    assert.equal(credited, Math.max(1_000, Math.floor(1_000 * shipMult)));
  });

  it('hire pool can include all five perks over refreshes', () => {
    const world = createSeedEconomyWorld({ seed: 'gs-pool-five' });
    const state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'GsPool',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    const seen = new Set<GroundStaffPerkId>();
    for (let i = 0; i < 40; i++) {
      world.tick += TICKS_PER_DAY;
      refreshGroundStaffHirePool(state, world, {
        hubIcao: 'SBGR',
        force: true,
      });
      for (const c of state.groundStaff?.hirePoolByHub?.SBGR ?? []) {
        seen.add(c.perkId);
      }
    }
    assert.ok(seen.has('logistics'));
    assert.ok(seen.has('yard'));
    assert.ok(seen.has('procurement'));
    assert.ok(seen.has('demand_desk'));
    assert.ok(seen.has('wh_ops'));
  });
});
