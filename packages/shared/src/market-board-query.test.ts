import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boardFreightKgForEstimates,
  boardDisplayPayUsd,
  formatMarketBoardSorts,
  parseMarketBoardSorts,
  queryMarketBoardPage,
  starterBoardFitRank,
  type MarketBoardSortable,
} from './market-board-query.js';

function row(
  partial: Partial<MarketBoardSortable> & Pick<MarketBoardSortable, 'payUsd'>,
): MarketBoardSortable {
  return {
    distanceNm: 100,
    commodityId: 'general',
    commodityName: 'General',
    availableKg: 1000,
    expiresAtTick: 100,
    ...partial,
  };
}

describe('boardFreightKgForEstimates', () => {
  it('uses claim cargo for open Contracts even when availableKg is 0', () => {
    assert.equal(
      boardFreightKgForEstimates({
        availableKg: 0,
        crewNeeded: true,
        claimCargoKg: 4200,
      }),
      4200,
    );
  });

  it('falls back to availableKg for normal freights', () => {
    assert.equal(
      boardFreightKgForEstimates({
        availableKg: 1500,
        crewNeeded: false,
        claimCargoKg: 4200,
      }),
      1500,
    );
    assert.equal(
      boardFreightKgForEstimates({ availableKg: 800 }),
      800,
    );
  });
});

describe('boardDisplayPayUsd', () => {
  it('uses pilot fee for Contracts when present', () => {
    assert.equal(
      boardDisplayPayUsd({
        lotPayUsd: 1_100_000,
        quantityKg: 22_000,
        crewNeeded: true,
        claimCargoKg: 2_000,
        pilotFeeUsd: 40_000,
      }),
      40_000,
    );
  });

  it('falls back to claim-slice freight when fee missing', () => {
    assert.equal(
      boardDisplayPayUsd({
        lotPayUsd: 1_100_000,
        quantityKg: 22_000,
        crewNeeded: true,
        claimCargoKg: 2_000,
      }),
      100_000,
    );
  });

  it('keeps full lot pay for normal freights', () => {
    assert.equal(
      boardDisplayPayUsd({
        lotPayUsd: 50_000,
        quantityKg: 10_000,
      }),
      50_000,
    );
  });
});

describe('parseMarketBoardSorts', () => {
  it('parses multi-level sorts and ignores junk', () => {
    assert.deepEqual(parseMarketBoardSorts('distance:asc,pay:desc,nope:asc'), [
      { key: 'distance', direction: 'asc' },
      { key: 'pay', direction: 'desc' },
    ]);
    assert.deepEqual(parseMarketBoardSorts(''), []);
    assert.equal(formatMarketBoardSorts(parseMarketBoardSorts('load:desc')), 'load:desc');
  });
});

describe('queryMarketBoardPage', () => {
  const rows = [
    row({ payUsd: 100, distanceNm: 500, commodityName: 'B', availableKg: 200, expiresAtTick: 40 }),
    row({ payUsd: 500, distanceNm: 50, commodityName: 'A', availableKg: 900, expiresAtTick: 80 }),
    row({ payUsd: 300, distanceNm: 200, commodityName: 'C', availableKg: 100, expiresAtTick: 60 }),
  ];

  it('defaults to unlocked-first (stable) and paginates', () => {
    const page1 = queryMarketBoardPage(rows, {
      currentTick: 0,
      page: 1,
      pageSize: 2,
    });
    assert.equal(page1.total, 3);
    assert.equal(page1.pageCount, 2);
    // All unlocked → preserve input order within access.
    assert.deepEqual(
      page1.rows.map((r) => r.payUsd),
      [100, 500],
    );
    const page2 = queryMarketBoardPage(rows, {
      currentTick: 0,
      page: 2,
      pageSize: 2,
    });
    assert.deepEqual(
      page2.rows.map((r) => r.payUsd),
      [300],
    );
  });

  it('keeps unlocked first even when client only asks for pay desc', () => {
    const mixed = [
      row({ payUsd: 900, commodityId: 'electronics', cargoLocked: true }),
      row({ payUsd: 200, commodityId: 'general', cargoLocked: false }),
      row({ payUsd: 400, commodityId: 'supplies', cargoLocked: false }),
    ];
    const result = queryMarketBoardPage(mixed, {
      currentTick: 0,
      sorts: [{ key: 'pay', direction: 'desc' }],
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.rows.map((r) => r.payUsd),
      [400, 200, 900],
    );
  });

  it('allows locked-first when access:desc is explicit', () => {
    const mixed = [
      row({ payUsd: 200, commodityId: 'general', cargoLocked: false }),
      row({ payUsd: 900, commodityId: 'electronics', cargoLocked: true }),
    ];
    const result = queryMarketBoardPage(mixed, {
      currentTick: 0,
      sorts: [
        { key: 'access', direction: 'desc' },
        { key: 'pay', direction: 'desc' },
      ],
      page: 1,
      pageSize: 10,
    });
    assert.equal(result.rows[0]?.cargoLocked, true);
  });

  it('filters by Cargo Ops access', () => {
    const mixed = [
      row({ payUsd: 100, commodityId: 'general', cargoLocked: false }),
      row({ payUsd: 200, commodityId: 'electronics', cargoLocked: true }),
    ];
    const open = queryMarketBoardPage(mixed, {
      currentTick: 0,
      accessFilter: 'open',
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      open.rows.map((r) => r.commodityId),
      ['general'],
    );
    const locked = queryMarketBoardPage(mixed, {
      currentTick: 0,
      accessFilter: 'locked',
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      locked.rows.map((r) => r.commodityId),
      ['electronics'],
    );
  });

  it('filters by international vs domestic lane', () => {
    const mixed = [
      row({ payUsd: 100, commodityId: 'general', international: false }),
      row({ payUsd: 800, commodityId: 'electronics', international: true }),
      row({ payUsd: 200, commodityId: 'machinery', international: false }),
    ];
    const intl = queryMarketBoardPage(mixed, {
      currentTick: 0,
      laneFilter: 'intl',
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      intl.rows.map((r) => r.commodityId),
      ['electronics'],
    );
    const domestic = queryMarketBoardPage(mixed, {
      currentTick: 0,
      laneFilter: 'domestic',
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      domestic.rows.map((r) => r.commodityId),
      ['general', 'machinery'],
    );
  });

  it('applies filters before sort so totals are global', () => {
    const result = queryMarketBoardPage(rows, {
      currentTick: 0,
      distanceMaxNm: 250,
      sorts: [{ key: 'distance', direction: 'asc' }],
      page: 1,
      pageSize: 10,
    });
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.rows.map((r) => r.distanceNm),
      [50, 200],
    );
  });

  it('filters expires using wall-clock hours (4 ticks/hour)', () => {
    // remaining ticks at tick 0: 40/80/60 → 10h / 20h / 15h
    const result = queryMarketBoardPage(rows, {
      currentTick: 0,
      expiresWithinHours: 12,
      page: 1,
      pageSize: 10,
    });
    assert.equal(result.total, 1);
    assert.equal(result.rows[0]!.expiresAtTick, 40);
  });

  it('supports multi-sort', () => {
    const tied = [
      row({ payUsd: 100, distanceNm: 300, commodityName: 'Z' }),
      row({ payUsd: 100, distanceNm: 100, commodityName: 'Y' }),
      row({ payUsd: 200, distanceNm: 50, commodityName: 'X' }),
    ];
    const result = queryMarketBoardPage(tied, {
      currentTick: 0,
      sorts: [
        { key: 'pay', direction: 'desc' },
        { key: 'distance', direction: 'asc' },
      ],
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.rows.map((r) => [r.payUsd, r.distanceNm]),
      [
        [200, 50],
        [100, 100],
        [100, 300],
      ],
    );
  });

  it('sorts and filters by estimated net', () => {
    const mixed = [
      row({ payUsd: 900, estimatedNetUsd: -200 }),
      row({ payUsd: 100, estimatedNetUsd: 50 }),
      row({ payUsd: 400, estimatedNetUsd: 120 }),
      row({ payUsd: 300, estimatedNetUsd: null }),
    ];
    const sorted = queryMarketBoardPage(mixed, {
      currentTick: 0,
      sorts: [{ key: 'net', direction: 'desc' }],
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      sorted.rows.map((r) => r.estimatedNetUsd),
      [120, 50, -200, null],
    );
    const profitable = queryMarketBoardPage(mixed, {
      currentTick: 0,
      profitableOnly: true,
      sorts: [{ key: 'net', direction: 'desc' }],
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      profitable.rows.map((r) => r.estimatedNetUsd),
      [120, 50],
    );
  });

  it('filters viable-only lots for a selected aircraft', () => {
    const mixed = [
      row({
        payUsd: 100,
        commodityId: 'general',
        cargoLocked: false,
        estimatedLiftKg: 400,
        estimatedInRange: true,
        estimatedFuelFeasible: true,
      }),
      row({
        payUsd: 200,
        commodityId: 'electronics',
        cargoLocked: true,
        estimatedLiftKg: 400,
        estimatedInRange: true,
        estimatedFuelFeasible: true,
      }),
      row({
        payUsd: 300,
        commodityId: 'supplies',
        cargoLocked: false,
        estimatedLiftKg: 0,
        estimatedInRange: true,
        estimatedFuelFeasible: true,
      }),
      row({
        payUsd: 400,
        commodityId: 'supplies',
        cargoLocked: false,
        estimatedLiftKg: 200,
        estimatedInRange: false,
        estimatedFuelFeasible: true,
      }),
      row({
        payUsd: 500,
        commodityId: 'general',
        cargoLocked: false,
        estimatedLiftKg: 100,
        estimatedInRange: true,
        estimatedFuelFeasible: false,
      }),
    ];
    const result = queryMarketBoardPage(mixed, {
      currentTick: 0,
      viableOnly: true,
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.rows.map((r) => r.payUsd),
      [100],
    );
  });

  it('empty hangar sorts starter crew and last-mile ahead of wide pay', () => {
    const mixed = [
      row({
        payUsd: 90_000,
        distanceNm: 800,
        crewNeeded: true,
        crewClassId: 'wide_freighter',
        availableKg: 0,
      }),
      row({
        payUsd: 12_000,
        distanceNm: 220,
        lastMile: true,
        availableKg: 280,
      }),
      row({
        payUsd: 4_000,
        distanceNm: 180,
        crewNeeded: true,
        crewClassId: 'light_ga',
        availableKg: 0,
      }),
      row({
        payUsd: 40_000,
        distanceNm: 2_100,
        availableKg: 18_000,
      }),
    ];
    assert.equal(
      starterBoardFitRank(mixed[2]!),
      0,
    );
    assert.equal(starterBoardFitRank(mixed[1]!), 1);
    const result = queryMarketBoardPage(mixed, {
      currentTick: 0,
      hangarEmpty: true,
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.rows.map((r) => r.payUsd),
      [4_000, 12_000, 40_000, 90_000],
    );
  });

  it('empty hangar viable-only keeps crew the starter can sit', () => {
    const mixed = [
      row({
        payUsd: 4_000,
        crewNeeded: true,
        crewClassId: 'light_ga',
        classLocked: false,
        estimatedInRange: true,
        availableKg: 0,
      }),
      row({
        payUsd: 80_000,
        crewNeeded: true,
        crewClassId: 'narrow_freighter',
        classLocked: true,
        estimatedInRange: true,
        availableKg: 0,
      }),
      row({
        payUsd: 12_000,
        lastMile: true,
        availableKg: 280,
        estimatedInRange: true,
      }),
      row({
        payUsd: 5_000,
        crewNeeded: true,
        crewClassId: 'light_turboprop',
        classLocked: false,
        estimatedInRange: false,
        availableKg: 0,
      }),
    ];
    const result = queryMarketBoardPage(mixed, {
      currentTick: 0,
      hangarEmpty: true,
      viableOnly: true,
      page: 1,
      pageSize: 10,
    });
    assert.deepEqual(
      result.rows.map((r) => r.payUsd),
      [4_000],
    );
  });
});
