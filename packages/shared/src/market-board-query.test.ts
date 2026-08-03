import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatMarketBoardSorts,
  parseMarketBoardSorts,
  queryMarketBoardPage,
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
});
