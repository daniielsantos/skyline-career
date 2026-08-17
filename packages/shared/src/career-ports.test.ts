/**
 * Seaport catalog + factory buy → hub pickup / warehouse.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  abandonPortPickup,
  buyPortListing,
  depositPortPickupToWarehouse,
  ensurePortListings,
  getCareerPort,
  listCareerPorts,
  listPortListings,
  quotePortListingUnitPriceUsd,
  resolvePortPickupHub,
  settlePortYardHoldFees,
  portSnapshot,
  PORT_YARD_HOLD_USD_PER_KG_DAY,
  PORT_YARD_HOLD_WARN_DAYS,
  stagePortPickupToFbo,
} from './career-ports.js';
import {
  buyWarehouseAtPickupHub,
  depositCargoToWarehouse,
  isPortPickupHub,
  WAREHOUSE_T1_CAPACITY_KG,
} from './career-warehouse.js';
import {
  airportByIcao,
  createSeedEconomyWorld,
  getCommodity,
  localUnitPriceUsd,
  migrateEconomyWorld,
} from './career-economy.js';
import { emptyMissionsStateV2, selectStarterHub } from './career-fleet.js';

describe('career ports', () => {
  it('charges yard hold fees on port pickups by economy day', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-yard' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'YardHold',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 50_000;
    state.portPickups = [
      {
        id: 'portpk_yard',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 1_000,
        avgCostUsdPerKg: 1,
        purchasedAtTick: world.tick,
      },
    ];
    const fromTick = world.tick;
    const toTick = world.tick + 96; // 1 economy day
    const fees = settlePortYardHoldFees(state, { fromTick, toTick });
    assert.equal(fees.daysCharged, 1);
    assert.ok(fees.debitUsd > 0);
    assert.equal(
      fees.requestedUsd,
      Math.round(1_000 * PORT_YARD_HOLD_USD_PER_KG_DAY * 100) / 100,
    );
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'port_yard_hold'));
  });

  it('exposes yard hold $/day and held days on port snapshot', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-yard-ui' });
    world.tick = 96 * 5;
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'YardUi',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.portPickups = [
      {
        id: 'portpk_ui',
        portId: 'BRSSZ',
        hubIcao: 'SBGR',
        commodityId: 'general',
        kg: 2_000,
        avgCostUsdPerKg: 1,
        purchasedAtTick: world.tick - 96 * 3,
      },
    ];
    const snap = portSnapshot(world, state);
    assert.equal(snap.pickups.length, 1);
    assert.equal(
      snap.pickups[0]!.holdUsdPerDay,
      Math.round(2_000 * PORT_YARD_HOLD_USD_PER_KG_DAY * 100) / 100,
    );
    assert.equal(snap.pickups[0]!.heldDays, 3);
    assert.equal(snap.yardHoldUsdPerDay, snap.pickups[0]!.holdUsdPerDay);
    assert.ok(snap.pickups[0]!.heldDays >= PORT_YARD_HOLD_WARN_DAYS);
  });

  it('rejects port buy when Cargo Ops commodity is locked', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-lock' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortLock',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    // Electronics starts locked on the Cargo Ops ladder.
    assert.equal(state.cargoOps!.commodities.electronics.unlocked, false);

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) => l.commodityId === 'electronics' && l.allocatedHubIcao === 'SBGR',
    );
    // Force an electronics listing if rng didn't spawn one.
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_lock_test',
        portId: 'BRSSZ',
        commodityId: 'electronics',
        availableKg: 5_000,
        unitPriceUsd: 4,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
    }
    const id = listing?.id ?? 'portlot_lock_test';
    assert.throws(
      () => buyPortListing(state, world, { listingId: id, kg: 500 }),
      /Cargo Ops: Electronics is locked/i,
    );
  });

  it('catalogs Americas ocean-access ports with pickup hubs', () => {
    const ports = listCareerPorts();
    assert.equal(ports.length, 117);
    const expect: Array<{
      id: string;
      hub: string;
    }> = [
      { id: 'BRSSZ', hub: 'SBGR' },
      { id: 'BRPNG', hub: 'SBCT' },
      { id: 'BRSUA', hub: 'SBRF' },
      { id: 'BRMAO', hub: 'SBEG' },
      { id: 'BRRIG', hub: 'SBPA' },
      { id: 'BRVDC', hub: 'SBBE' },
      { id: 'ARBUE', hub: 'SAEZ' },
      { id: 'ARCRD', hub: 'SAVC' },
      { id: 'CLSAN', hub: 'SCEL' },
      { id: 'CLPME', hub: 'SCTE' },
      { id: 'USMIA', hub: 'KMIA' },
      { id: 'USEWR', hub: 'KEWR' },
      { id: 'USHOU', hub: 'KIAH' },
      { id: 'USLAX', hub: 'KLAX' },
      { id: 'USSEA', hub: 'KSEA' },
      { id: 'CAVAN', hub: 'CYVR' },
      { id: 'CAHAL', hub: 'CYHZ' },
      { id: 'MXVER', hub: 'MMVR' },
      { id: 'MXZLO', hub: 'MMZO' },
      { id: 'MXCUN', hub: 'MMUN' },
      { id: 'UYMVD', hub: 'SUMU' },
      { id: 'PECLL', hub: 'SPJC' },
      { id: 'ECGYE', hub: 'SEGU' },
      { id: 'COCTG', hub: 'SKCG' },
      { id: 'COBUN', hub: 'SKCL' },
      { id: 'VELAG', hub: 'SVMI' },
      { id: 'GYGEO', hub: 'SYCJ' },
      { id: 'SRPBM', hub: 'SMJP' },
      { id: 'GFCAY', hub: 'SOCA' },
      { id: 'PAPTY', hub: 'MPTO' },
      { id: 'CRLIM', hub: 'MRLM' },
      { id: 'NICOR', hub: 'MNMG' },
      { id: 'HNPCS', hub: 'MHLM' },
      { id: 'SVACA', hub: 'MSLP' },
      { id: 'GTPQ', hub: 'MGGT' },
      { id: 'BZBLZ', hub: 'MZBZ' },
      { id: 'CUHAV', hub: 'MUHA' },
      { id: 'DOSDQ', hub: 'MDSD' },
      { id: 'HTPAP', hub: 'MTPP' },
      { id: 'JMKIN', hub: 'MKJP' },
      { id: 'BSNAS', hub: 'MYNN' },
      { id: 'TTPOS', hub: 'TTPP' },
      { id: 'BBBGI', hub: 'TBPB' },
      { id: 'LCCAS', hub: 'TLPL' },
      { id: 'GDSTG', hub: 'TGPY' },
      { id: 'AGANU', hub: 'TAPA' },
      { id: 'USSJU', hub: 'TJSJ' },
      { id: 'GPPTP', hub: 'TFFR' },
      { id: 'MQFDF', hub: 'TFFF' },
      { id: 'CWWIL', hub: 'TNCC' },
      { id: 'SXPHI', hub: 'TNCM' },
      { id: 'AWORJ', hub: 'TNCA' },
      { id: 'USSTT', hub: 'TIST' },
      { id: 'PTLIS', hub: 'LPPT' },
      { id: 'ESBCN', hub: 'LEBL' },
      { id: 'FRMRS', hub: 'LFML' },
      { id: 'GBSOU', hub: 'EGHI' },
      { id: 'DEHAM', hub: 'EDDH' },
      { id: 'NLRTM', hub: 'EHRD' },
      { id: 'BEANR', hub: 'EBAW' },
      { id: 'ITNAP', hub: 'LIRN' },
      { id: 'IEDUB', hub: 'EIDW' },
      { id: 'DKCPH', hub: 'EKCH' },
      { id: 'NOOSL', hub: 'ENGM' },
      { id: 'SEGOT', hub: 'ESGG' },
      { id: 'FIHEL', hub: 'EFHK' },
      { id: 'PLGDN', hub: 'EPGD' },
      { id: 'EETLL', hub: 'EETN' },
      { id: 'LVRIX', hub: 'EVRA' },
      { id: 'LTKLJ', hub: 'EYPA' },
      { id: 'HRSPL', hub: 'LDSP' },
      { id: 'SIKOP', hub: 'LJLJ' },
      { id: 'BGVAR', hub: 'LBWN' },
      { id: 'GRPIR', hub: 'LGAV' },
      { id: 'MATNG', hub: 'GMTT' },
      { id: 'DZALG', hub: 'DAAG' },
      { id: 'TNTUN', hub: 'DTTA' },
      { id: 'EGALY', hub: 'HEBA' },
      { id: 'ILHFA', hub: 'LLHA' },
      { id: 'IQBSR', hub: 'ORMM' },
      { id: 'IRBND', hub: 'OIKB' },
      { id: 'JOAQB', hub: 'OJAQ' },
      { id: 'LBBEY', hub: 'OLBA' },
      { id: 'SYLTK', hub: 'OSLK' },
      { id: 'LYMRA', hub: 'HLMS' },
      { id: 'SDPZU', hub: 'HSPN' },
      { id: 'YEADN', hub: 'OYAA' },
      { id: 'YEHOD', hub: 'OYHD' },
      { id: 'PKKHI', hub: 'OPKC' },
      { id: 'INBOM', hub: 'VABB' },
      { id: 'INMAA', hub: 'VOMM' },
      { id: 'INCCU', hub: 'VECC' },
      { id: 'LKCMB', hub: 'VCBI' },
      { id: 'KZAKT', hub: 'UATE' },
      { id: 'TMKRW', hub: 'UTAK' },
      { id: 'BDCGP', hub: 'VGEG' },
      { id: 'MMYGN', hub: 'VYYY' },
      { id: 'THLCB', hub: 'VTBU' },
      { id: 'THHKT', hub: 'VTSP' },
    ];
    for (const row of expect) {
      const port = getCareerPort(row.id);
      assert.ok(port, row.id);
      assert.equal(resolvePortPickupHub(port!), row.hub);
      assert.ok(port!.pickupHubs.includes(row.hub));
    }
    assert.ok(getCareerPort('BRSSZ')!.pickupHubs.includes('SBKP'));
    assert.deepEqual([...getCareerPort('BRRIG')!.pickupHubs], ['SBPA']);
    assert.deepEqual([...getCareerPort('BRVDC')!.pickupHubs], ['SBBE']);
    assert.ok(getCareerPort('BRRIG')!.lat < -32 && getCareerPort('BRRIG')!.lat > -33);
    assert.ok(getCareerPort('BRVDC')!.lat < -1 && getCareerPort('BRVDC')!.lat > -2);
    assert.equal(getCareerPort('ARBUE')!.countryId, 'AR');
    assert.equal(getCareerPort('CLSAN')!.countryId, 'CL');
    assert.equal(getCareerPort('USMIA')!.countryId, 'US');
    assert.equal(getCareerPort('CAVAN')!.countryId, 'CA');
    assert.equal(getCareerPort('MXCUN')!.countryId, 'MX');
    assert.equal(getCareerPort('UYMVD')!.countryId, 'UY');
    assert.equal(getCareerPort('PECLL')!.countryId, 'PE');
    assert.equal(getCareerPort('ECGYE')!.countryId, 'EC');
    assert.equal(getCareerPort('COCTG')!.countryId, 'CO');
    assert.equal(getCareerPort('VELAG')!.countryId, 'VE');
    assert.equal(getCareerPort('GYGEO')!.countryId, 'GY');
    assert.equal(getCareerPort('SRPBM')!.countryId, 'SR');
    assert.equal(getCareerPort('GFCAY')!.countryId, 'GF');
    assert.equal(getCareerPort('PAPTY')!.countryId, 'PA');
    assert.equal(getCareerPort('CRLIM')!.countryId, 'CR');
    assert.equal(getCareerPort('NICOR')!.countryId, 'NI');
    assert.equal(getCareerPort('HNPCS')!.countryId, 'HN');
    assert.equal(getCareerPort('SVACA')!.countryId, 'SV');
    assert.equal(getCareerPort('GTPQ')!.countryId, 'GT');
    assert.equal(getCareerPort('BZBLZ')!.countryId, 'BZ');
    assert.equal(getCareerPort('CUHAV')!.countryId, 'CU');
    assert.equal(getCareerPort('DOSDQ')!.countryId, 'DO');
    assert.equal(getCareerPort('JMKIN')!.countryId, 'JM');
    assert.equal(getCareerPort('BSNAS')!.countryId, 'BS');
    assert.equal(getCareerPort('TTPOS')!.countryId, 'TT');
    assert.equal(getCareerPort('BBBGI')!.countryId, 'BB');
    assert.equal(resolvePortPickupHub(getCareerPort('UYMVD')!), 'SUMU');
    assert.equal(resolvePortPickupHub(getCareerPort('PECLL')!), 'SPJC');
    // Houston marker must sit on Galveston Bay terminals, not inland Turning Basin.
    const houston = getCareerPort('USHOU')!;
    assert.ok(houston.lat > 29.65 && houston.lat < 29.72);
    assert.ok(houston.lon > -95.05 && houston.lon < -94.95);
  });

  it('allows warehouse buy at Suape pickup hub SBRF', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-suape-wh' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBRF', {
      pilotName: 'SuapeWh',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    const bought = buyWarehouseAtPickupHub(state, world, 'SBRF');
    assert.equal(bought.warehouse.icao, 'SBRF');
    assert.equal(bought.warehouse.capacityKg, WAREHOUSE_T1_CAPACITY_KG);

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSUA').find(
      (l) =>
        l.allocatedHubIcao === 'SBRF' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      listing = {
        id: 'portlot_suape_test',
        portId: 'BRSUA',
        commodityId: 'general',
        availableKg: 8_000,
        unitPriceUsd: 1.2,
        allocatedHubIcao: 'SBRF',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
      };
      world.portListings.push(listing);
    }

    const boughtCargo = buyPortListing(state, world, {
      listingId: listing.id,
      kg: 1_000,
    });
    assert.equal(boughtCargo.kg, 1_000);
    assert.equal(boughtCargo.inboundKg + boughtCargo.yardKg, 1_000);
    assert.ok(boughtCargo.inboundKg > 0, 'WH free space should reserve inbound');
    assert.equal((state.playerWarehouses?.stock ?? []).length, 0);
    assert.ok(
      (state.playerWarehouses?.inboundTransfers ?? []).some(
        (x) => x.warehouseId === bought.warehouse.id && x.kg > 0,
      ),
    );
  });

  it('allows warehouse buy at Manaus ocean-river pickup hub SBEG', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-manaus-wh' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBEG', {
      pilotName: 'ManausWh',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 200_000;
    const bought = buyWarehouseAtPickupHub(state, world, 'SBEG');
    assert.equal(bought.warehouse.icao, 'SBEG');

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRMAO').find(
      (l) =>
        l.allocatedHubIcao === 'SBEG' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      listing = {
        id: 'portlot_manaus_test',
        portId: 'BRMAO',
        commodityId: 'general',
        availableKg: 8_000,
        unitPriceUsd: 1.2,
        allocatedHubIcao: 'SBEG',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 200,
        status: 'open',
      };
      world.portListings.push(listing);
    }

    const boughtCargo = buyPortListing(state, world, {
      listingId: listing.id,
      kg: 800,
    });
    assert.equal(boughtCargo.kg, 800);
    assert.equal(boughtCargo.inboundKg + boughtCargo.yardKg, 800);
    assert.ok(boughtCargo.inboundKg > 0);
  });

  it('allows warehouse buy at Rio Grande and Vila do Conde pickup hubs', () => {
    for (const row of [
      { seed: 'ports-rig-wh', hub: 'SBPA', portId: 'BRRIG' },
      { seed: 'ports-vdc-wh', hub: 'SBBE', portId: 'BRVDC' },
    ] as const) {
      const world = createSeedEconomyWorld({ seed: row.seed });
      let state = selectStarterHub(emptyMissionsStateV2(), row.hub, {
        pilotName: `Wh${row.hub}`,
        airframeTypeId: 'asobo-c172sp-cargo',
      });
      state.walletUsd = 200_000;
      const bought = buyWarehouseAtPickupHub(state, world, row.hub);
      assert.equal(bought.warehouse.icao, row.hub);

      ensurePortListings(world);
      let listing = listPortListings(world, row.portId).find(
        (l) =>
          l.allocatedHubIcao === row.hub &&
          (l.commodityId === 'general' || l.commodityId === 'supplies'),
      );
      if (!listing) {
        world.portListings = world.portListings ?? [];
        listing = {
          id: `portlot_${row.portId}_test`,
          portId: row.portId,
          commodityId: 'general',
          availableKg: 8_000,
          unitPriceUsd: 1.2,
          allocatedHubIcao: row.hub,
          arrivedAtTick: world.tick,
          expiresAtTick: world.tick + 200,
          status: 'open',
        };
        world.portListings.push(listing);
      }

      const boughtCargo = buyPortListing(state, world, {
        listingId: listing.id,
        kg: 600,
      });
      assert.equal(boughtCargo.kg, 600);
      assert.equal(boughtCargo.inboundKg + boughtCargo.yardKg, 600);
      assert.ok(boughtCargo.inboundKg > 0, row.hub);
    }
  });

  it('allows warehouse buy at AR/US sample pickup hubs SAEZ and KMIA', () => {
    for (const hub of [
      'SAEZ',
      'SAVC',
      'SCEL',
      'SCTE',
      'KMIA',
      'KEWR',
      'KIAH',
      'KLAX',
      'KSEA',
    ] as const) {
      assert.ok(isPortPickupHub(hub), hub);
    }
    for (const row of [
      { seed: 'ports-saez-wh', hub: 'SAEZ', portId: 'ARBUE' },
      { seed: 'ports-kmia-wh', hub: 'KMIA', portId: 'USMIA' },
    ] as const) {
      const world = createSeedEconomyWorld({ seed: row.seed });
      let state = selectStarterHub(emptyMissionsStateV2(), row.hub, {
        pilotName: `Wh${row.hub}`,
        airframeTypeId: 'asobo-c172sp-cargo',
      });
      state.walletUsd = 200_000;
      const bought = buyWarehouseAtPickupHub(state, world, row.hub);
      assert.equal(bought.warehouse.icao, row.hub);

      ensurePortListings(world);
      let listing = listPortListings(world, row.portId).find(
        (l) =>
          l.allocatedHubIcao === row.hub &&
          (l.commodityId === 'general' || l.commodityId === 'supplies'),
      );
      if (!listing) {
        world.portListings = world.portListings ?? [];
        listing = {
          id: `portlot_${row.portId}_test`,
          portId: row.portId,
          commodityId: 'general',
          availableKg: 8_000,
          unitPriceUsd: 1.2,
          allocatedHubIcao: row.hub,
          arrivedAtTick: world.tick,
          expiresAtTick: world.tick + 200,
          status: 'open',
        };
        world.portListings.push(listing);
      }

      const boughtCargo = buyPortListing(state, world, {
        listingId: listing.id,
        kg: 600,
      });
      assert.equal(boughtCargo.kg, 600);
      assert.equal(boughtCargo.inboundKg + boughtCargo.yardKg, 600);
      assert.ok(boughtCargo.inboundKg > 0, row.hub);
    }
  });

  it('allows warehouse buy at CA/MX sample pickup hubs CYVR and MMUN', () => {
    for (const hub of [
      'CYVR',
      'CYHZ',
      'MMVR',
      'MMZO',
      'MMUN',
    ] as const) {
      assert.ok(isPortPickupHub(hub), hub);
    }
    for (const row of [
      { seed: 'ports-cyvr-wh', hub: 'CYVR', portId: 'CAVAN' },
      { seed: 'ports-mmun-wh', hub: 'MMUN', portId: 'MXCUN' },
    ] as const) {
      const world = createSeedEconomyWorld({ seed: row.seed });
      let state = selectStarterHub(emptyMissionsStateV2(), row.hub, {
        pilotName: `Wh${row.hub}`,
        airframeTypeId: 'asobo-c172sp-cargo',
      });
      state.walletUsd = 200_000;
      const bought = buyWarehouseAtPickupHub(state, world, row.hub);
      assert.equal(bought.warehouse.icao, row.hub);

      ensurePortListings(world);
      let listing = listPortListings(world, row.portId).find(
        (l) =>
          l.allocatedHubIcao === row.hub &&
          (l.commodityId === 'general' || l.commodityId === 'supplies'),
      );
      if (!listing) {
        world.portListings = world.portListings ?? [];
        listing = {
          id: `portlot_${row.portId}_test`,
          portId: row.portId,
          commodityId: 'general',
          availableKg: 8_000,
          unitPriceUsd: 1.2,
          allocatedHubIcao: row.hub,
          arrivedAtTick: world.tick,
          expiresAtTick: world.tick + 200,
          status: 'open',
        };
        world.portListings.push(listing);
      }

      const boughtCargo = buyPortListing(state, world, {
        listingId: listing.id,
        kg: 600,
      });
      assert.equal(boughtCargo.kg, 600);
      assert.equal(boughtCargo.inboundKg + boughtCargo.yardKg, 600);
      assert.ok(boughtCargo.inboundKg > 0, row.hub);
    }
  });

  it('seeds dynamic factory listings cheaper than hub spot and base', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-seed' });
    const listings = ensurePortListings(world);
    assert.ok(listings.length >= 2);
    const sample = listPortListings(world, 'BRSSZ')[0];
    assert.ok(sample);
    const base = getCommodity(sample!.commodityId).basePricePerKg;
    assert.ok(sample!.unitPriceUsd < base);
    // Dynamic: must not equal the old static formula for every seed, but must
    // stay below live hub spot when the hub has inventory.
    const hub = airportByIcao(world, sample!.allocatedHubIcao);
    const pile = hub?.inventory[sample!.commodityId];
    if (pile) {
      const spot = localUnitPriceUsd(sample!.commodityId, pile);
      assert.ok(sample!.unitPriceUsd < spot);
      assert.ok(sample!.unitPriceUsd <= spot * 0.7 + 1e-6);
    }
    assert.ok(sample!.unitPriceUsd >= base * 0.35 - 1e-6);
  });

  it('quotes different listing prices when hub fill changes', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-dyn' });
    const hub = airportByIcao(world, 'SBGR');
    assert.ok(hub);
    const pile = hub!.inventory.general!;
    pile.stockKg = Math.floor(pile.capacityKg * 0.05);
    const low = quotePortListingUnitPriceUsd(world, {
      commodityId: 'general',
      allocatedHubIcao: 'SBGR',
      rng: () => 0.5,
    });
    pile.stockKg = Math.floor(pile.capacityKg * 0.95);
    const high = quotePortListingUnitPriceUsd(world, {
      commodityId: 'general',
      allocatedHubIcao: 'SBGR',
      rng: () => 0.5,
    });
    assert.ok(low.hubSpotUnitPriceUsd != null);
    assert.ok(high.hubSpotUnitPriceUsd != null);
    assert.ok(low.hubSpotUnitPriceUsd! > high.hubSpotUnitPriceUsd!);
    assert.ok(low.unitPriceUsd > high.unitPriceUsd);
  });

  it('buys listing into hub pickup then stores in warehouse', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortBuyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;

    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing, 'expected a Dry Santos listing allocated to SBGR');

    const before = state.walletUsd;
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 1_000,
    });
    assert.equal(bought.kg, 1_000);
    assert.equal(bought.storedKg, 0);
    assert.equal(bought.yardKg, 1_000);
    assert.ok(bought.debitUsd > 0);
    assert.equal(state.walletUsd, before - bought.debitUsd);
    assert.ok(bought.pickup);
    assert.equal(state.portPickups!.length, 1);
    assert.equal(state.portPickups![0]!.hubIcao, 'SBGR');
    assert.ok((state.ledger ?? []).some((e) => e.kind === 'port_buy'));

    buyWarehouseAtPickupHub(state, world, 'SBGR');
    const deposited = depositPortPickupToWarehouse(state, world, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(deposited.kg, 1_000);
    assert.equal(deposited.remainingYardKg, 0);
    assert.equal(state.portPickups!.length, 0);
    assert.equal(
      state.playerWarehouses!.stock.reduce((s, p) => s + p.kg, 0),
      1_000,
    );
  });

  it('buy with WH free space stores what fits and yards the rest', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-split-buy' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortSplit',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');
    depositCargoToWarehouse(state, {
      icao: 'SBGR',
      commodityId: 'supplies',
      kg: WAREHOUSE_T1_CAPACITY_KG - 800,
      avgCostUsdPerKg: 1,
      tick: world.tick,
    });

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_split_test',
        portId: 'BRSSZ',
        commodityId: 'general',
        availableKg: 5_000,
        unitPriceUsd: 1.5,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 96 * 3,
        status: 'open',
      });
      listing = world.portListings.at(-1)!;
    }
    assert.ok(listing);

    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: 2_000,
    });
    assert.equal(bought.inboundKg, 800);
    assert.equal(bought.yardKg, 1_200);
    assert.ok(bought.inboundTransfer);
    assert.equal(bought.inboundTransfer!.kg, 800);
    assert.ok(bought.pickup);
    assert.equal(bought.pickup!.kg, 1_200);
  });

  it('partial store leaves remainder in yard; abandon drops oversized hold', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-partial-abandon' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortAbandon',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    buyWarehouseAtPickupHub(state, world, 'SBGR');

    ensurePortListings(world);
    let listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= WAREHOUSE_T1_CAPACITY_KG + 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    if (!listing) {
      world.portListings = world.portListings ?? [];
      world.portListings.push({
        id: 'portlot_oversized',
        portId: 'BRSSZ',
        commodityId: 'general',
        availableKg: 50_000,
        unitPriceUsd: 1,
        allocatedHubIcao: 'SBGR',
        arrivedAtTick: world.tick,
        expiresAtTick: world.tick + 100,
        status: 'open',
      });
      listing = listPortListings(world, 'BRSSZ').find(
        (l) => l.id === 'portlot_oversized',
      );
    }
    assert.ok(listing);

    const buyKg = WAREHOUSE_T1_CAPACITY_KG + 2_000;
    const bought = buyPortListing(state, world, {
      listingId: listing!.id,
      kg: buyKg,
    });
    assert.equal(bought.inboundKg, WAREHOUSE_T1_CAPACITY_KG);
    assert.equal(bought.yardKg, 2_000);
    assert.equal(bought.pickup!.kg, 2_000);

    // Free some WH space — inbound still reserved until settle, so clear transfers
    // then leave 500 free for partial yard Store.
    state.playerWarehouses!.inboundTransfers = [];
    state.playerWarehouses!.stock = [
      {
        id: 'whpile_fill',
        warehouseId: state.playerWarehouses!.warehouses[0]!.id,
        commodityId: 'supplies',
        kg: WAREHOUSE_T1_CAPACITY_KG - 500,
        avgCostUsdPerKg: 1,
        acquiredAtTick: world.tick,
      },
    ];
    const deposited = depositPortPickupToWarehouse(state, world, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(deposited.kg, 500);
    assert.equal(deposited.remainingYardKg, 1_500);
    assert.equal(state.portPickups![0]!.kg, 1_500);

    const abandoned = abandonPortPickup(state, {
      pickupId: bought.pickup!.id,
    });
    assert.equal(abandoned.kg, 1_500);
    assert.equal((state.portPickups ?? []).length, 0);
  });

  it('rejects fly-to-FBO stage (removed)', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-stage' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortFlyer',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    assert.throws(
      () =>
        stagePortPickupToFbo(state, world, {
          pickupId: 'x',
          destIcao: 'SBCT',
          aircraftId: 'y',
        }),
      /Demand Board/i,
    );
  });

  it('stacks multiple buys as separate pickups without warehouse', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-stack' });
    let state = selectStarterHub(emptyMissionsStateV2(), 'SBGR', {
      pilotName: 'PortStack',
      airframeTypeId: 'asobo-c172sp-cargo',
    });
    state.walletUsd = 500_000;
    ensurePortListings(world);
    const listing = listPortListings(world, 'BRSSZ').find(
      (l) =>
        l.allocatedHubIcao === 'SBGR' &&
        l.availableKg >= 2_000 &&
        (l.commodityId === 'general' || l.commodityId === 'supplies'),
    );
    assert.ok(listing);
    buyPortListing(state, world, { listingId: listing!.id, kg: 1_000 });
    buyPortListing(state, world, { listingId: listing!.id, kg: 1_000 });
    assert.equal(state.portPickups!.length, 2);
    assert.equal(
      state.portPickups!.reduce((s, p) => s + p.kg, 0),
      2_000,
    );
  });

  it('migrateEconomyWorld keeps port listings', () => {
    const world = createSeedEconomyWorld({ seed: 'ports-migrate' });
    ensurePortListings(world);
    const before = world.portListings!.map((l) => l.id).sort();
    assert.ok(before.length >= 2);
    const migrated = migrateEconomyWorld(structuredClone(world));
    const after = (migrated.portListings ?? []).map((l) => l.id).sort();
    assert.deepEqual(after, before);
  });
});
