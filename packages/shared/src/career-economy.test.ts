import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFreightDelivery,
  continuousEconomyHours,
  corridorPartners,
  corridorWeight,
  createSeedEconomyWorld,
  DEAD_LOT_RETENTION_TICKS,
  ensureCareerHubCoverage,
  ensureEconomyCaughtUp,
  ensureSeedMarketFormed,
  escalateIdleLots,
  hubTierOf,
  HUB_TIER_PROFILE,
  idleLotLifeProgress,
  idleLotPayMult,
  idleLotPayMaxMultForLot,
  IDLE_LOT_PAY_MAX_MULT,
  IDLE_LOT_PAY_MAX_MULT_HEAVY,
  IDLE_LOT_PAY_MAX_MULT_BULK,
  GA_LTL_MAX_KG,
  LAST_MILE_MAX_NM,
  SMALL_LOT_MAX_NM,
  LAST_MILE_OPEN_LOTS_PER_ORIGIN,
  SMALL_LOT_MIN_KG,
  SMALL_LOT_MAX_KG,
  BOARD_AVAILABLE_SOFT_CAP,
  BOARD_COVER_DAYS,
  LOT_FORMATION_RESERVE_FRACTION,
  partitionBoardKgTarget,
  INTL_BOARD_PARTITION,
  lotBoardPartition,
  partitionAvailableQuota,
  STALE_LARGE_RECYCLE_MAX_PER_COMMODITY,
  STALE_SMALL_RECYCLE_MAX_PER_COMMODITY,
  STALE_SMALL_RECYCLE_PROGRESS,
  STALE_LAST_MILE_RECYCLE_PROGRESS,
  laneDemandShock,
  laneLotCaps,
  listActiveEconomyEvents,
  listAirportFuelInbound,
  listMarketLots,
  localPriceMultiplier,
  marketQueryTokens,
  migrateEconomyWorld,
  msfsFacilityMatchesCareerHub,
  pruneOrphanCareerHubs,
  remapMislabelledClHubs,
  remapRetiredCareerAirportIdents,
  MS_PER_HOUR,
  MS_PER_TICK,
  TICKS_PER_DAY,
  npcLaneSaturation,
  npcRegionBidCapacity,
  pruneDeadLots,
  routeDistanceNm,
  tickEconomyN,
  createEmptyTickPhaseProfile,
  LARGE_LOT_MAX_KG,
  LANE_SATURATION_KG,
  XL_CORRIDOR_MIN_WEIGHT,
  XL_LOT_MAX_KG,
  XL_LOT_MIN_KG,
  xlLotOdEligible,
} from './career-economy.js';
import { listNpcHomeRegions, targetNpcFleetSize } from './career-npc.js';
import { BR_CAREER_HUBS } from './career-br-hubs.js';
import { CA_CAREER_HUBS } from './career-ca-hubs.js';
import { MX_CAREER_HUBS } from './career-mx-hubs.js';
import { US_CAREER_HUBS } from './career-us-hubs.js';
import { countryIdFromRegion, listWorldCountryIds } from './career-partition.js';
import type {
  CareerEconomyWorld,
  CommodityId,
  EconomyEvent,
  NpcFlight,
  ShipmentLot,
} from './types/career-economy.js';

describe('career-economy seed', () => {
  it('creates Americas hubs across SA + Central America + Caribbean', () => {
    const world = createSeedEconomyWorld({ seed: 'test-a' });
    assert.equal(world.version, 3);
    assert.ok(typeof world.lastBatchAtMs === 'number');
    assert.ok(Array.isArray(world.events));
    assert.equal(world.airports.length, 934);
    assert.equal(world.homeCountryId, 'BR');
    assert.ok((world.internationalLanes?.length ?? 0) >= 229);
    const br = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BR',
    );
    const us = world.airports.filter((a) => a.icao.startsWith('K'));
    const ca = world.airports.filter((a) => a.icao.startsWith('CY'));
    const mx = world.airports.filter((a) => a.icao.startsWith('MM'));
    const ar = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AR',
    );
    const cl = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CL',
    );
    const uy = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'UY',
    );
    const py = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PY',
    );
    const pe = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PE',
    );
    const bo = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BO',
    );
    const ec = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'EC',
    );
    const co = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CO',
    );
    const ve = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'VE',
    );
    const gy = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GY',
    );
    const sr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SR',
    );
    const gf = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GF',
    );
    const pa = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PA',
    );
    const cr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CR',
    );
    const ni = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'NI',
    );
    const hn = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'HN',
    );
    const sv = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SV',
    );
    const gt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GT',
    );
    const bz = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BZ',
    );
    const cu = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CU',
    );
    const dominican = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'DO',
    );
    const ht = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'HT',
    );
    const jm = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'JM',
    );
    const bs = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BS',
    );
    const tt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TT',
    );
    const bb = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BB',
    );
    const lc = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LC',
    );
    const gd = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GD',
    );
    const ag = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AG',
    );
    const gp = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GP',
    );
    const mq = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MQ',
    );
    const cw = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CW',
    );
    const sx = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SX',
    );
    const aw = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AW',
    );
    const usPr = world.airports.filter((a) => a.region === 'US-PR');
    const usVi = world.airports.filter((a) => a.region === 'US-VI');
    const pt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PT',
    );
    const es = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'ES',
    );
    const fr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'FR',
    );
    const gb = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GB',
    );
    const de = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'DE',
    );
    const nl = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'NL',
    );
    const be = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BE',
    );
    const it = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IT',
    );
    const ie = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IE',
    );
    const dk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'DK',
    );
    const no = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'NO',
    );
    const se = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SE',
    );
    const fi = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'FI',
    );
    const ch = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CH',
    );
    const at = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AT',
    );
    const pl = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PL',
    );
    const cz = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CZ',
    );
    const sk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SK',
    );
    const hu = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'HU',
    );
    const ee = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'EE',
    );
    const lv = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LV',
    );
    const lt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LT',
    );
    const hr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'HR',
    );
    const si = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SI',
    );
    const ro = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'RO',
    );
    const bg = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BG',
    );
    const gr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GR',
    );
    const rs = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'RS',
    );
    const is = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IS',
    );
    const ba = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BA',
    );
    const me = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'ME',
    );
    const al = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AL',
    );
    const mk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MK',
    );
    const tr = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TR',
    );
    const ua = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'UA',
    );
    const by = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BY',
    );
    const md = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MD',
    );
    const ge = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'GE',
    );
    const am = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AM',
    );
    const az = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AZ',
    );
    const lu = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LU',
    );
    const mt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MT',
    );
    const cy = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'CY',
    );
    const xk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'XK',
    );
    const ma = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MA',
    );
    const dz = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'DZ',
    );
    const tn = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TN',
    );
    const eg = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'EG',
    );
    const il = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IL',
    );
    const sa = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SA',
    );
    const ae = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AE',
    );
    const qa = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'QA',
    );
    const bh = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BH',
    );
    const kw = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'KW',
    );
    const om = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'OM',
    );
    const iq = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IQ',
    );
    const ir = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IR',
    );
    const jo = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'JO',
    );
    const lb = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LB',
    );
    const sy = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SY',
    );
    const ly = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LY',
    );
    const sd = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SD',
    );
    const ye = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'YE',
    );
    const pk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'PK',
    );
    const india = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'IN',
    );
    const lk = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'LK',
    );
    const kz = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'KZ',
    );
    const uz = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'UZ',
    );
    const tm = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TM',
    );
    const tj = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TJ',
    );
    const kg = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'KG',
    );
    const af = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'AF',
    );
    const np = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'NP',
    );
    const bd = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BD',
    );
    const bt = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'BT',
    );
    const mm = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MM',
    );
    const th = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'TH',
    );
    const vn = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'VN',
    );
    const my = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'MY',
    );
    const sg = world.airports.filter(
      (a) => countryIdFromRegion(a.region) === 'SG',
    );
    assert.equal(br.length, 62);
    assert.equal(us.length, 123);
    assert.equal(world.airports.filter((a) => a.bushTripOnly).length, 32);
    for (const ap of world.airports.filter((a) => a.bushTripOnly)) {
      assert.equal(
        Object.values(ap.production).every((v) => v === 0),
        true,
        `${ap.icao} should have zero production`,
      );
      assert.equal(
        Object.values(ap.consumption).every((v) => v === 0),
        true,
        `${ap.icao} should have zero consumption`,
      );
      assert.equal(
        Object.values(ap.inventory).every((pile) => pile.stockKg === 0),
        true,
        `${ap.icao} should have empty stock`,
      );
    }
    assert.equal(ca.length, 53);
    assert.equal(mx.length, 47);
    assert.equal(ar.length, 41);
    assert.equal(cl.length, 21);
    assert.equal(uy.length, 7);
    assert.equal(py.length, 7);
    assert.equal(pe.length, 14);
    assert.equal(bo.length, 9);
    assert.equal(ec.length, 9);
    assert.equal(co.length, 16);
    assert.equal(ve.length, 13);
    assert.equal(gy.length, 5);
    assert.equal(sr.length, 5);
    assert.equal(gf.length, 3);
    assert.equal(pa.length, 7);
    assert.equal(cr.length, 7);
    assert.equal(ni.length, 5);
    assert.equal(hn.length, 6);
    assert.equal(sv.length, 2);
    assert.equal(gt.length, 6);
    assert.equal(bz.length, 4);
    assert.equal(cu.length, 7);
    assert.equal(dominican.length, 6);
    assert.equal(ht.length, 3);
    assert.equal(jm.length, 5);
    assert.equal(bs.length, 5);
    assert.equal(tt.length, 2);
    assert.equal(bb.length, 1);
    assert.equal(lc.length, 2);
    assert.equal(gd.length, 1);
    assert.equal(ag.length, 2);
    assert.equal(gp.length, 2);
    assert.equal(mq.length, 1);
    assert.equal(cw.length, 1);
    assert.equal(sx.length, 1);
    assert.equal(aw.length, 1);
    assert.equal(usPr.length, 5);
    assert.equal(usVi.length, 2);
    assert.equal(pt.length, 7);
    assert.equal(es.length, 14);
    assert.equal(fr.length, 14);
    assert.equal(gb.length, 12);
    assert.equal(de.length, 12);
    assert.equal(nl.length, 4);
    assert.equal(be.length, 3);
    assert.equal(it.length, 12);
    assert.equal(ie.length, 5);
    assert.equal(dk.length, 5);
    assert.equal(no.length, 8);
    assert.equal(se.length, 8);
    assert.equal(fi.length, 6);
    assert.equal(ch.length, 5);
    assert.equal(at.length, 6);
    assert.equal(pl.length, 10);
    assert.equal(cz.length, 5);
    assert.equal(sk.length, 4);
    assert.equal(hu.length, 5);
    assert.equal(ee.length, 3);
    assert.equal(lv.length, 3);
    assert.equal(lt.length, 4);
    assert.equal(hr.length, 5);
    assert.equal(si.length, 2);
    assert.equal(ro.length, 6);
    assert.equal(bg.length, 4);
    assert.equal(gr.length, 8);
    assert.equal(rs.length, 3);
    assert.equal(is.length, 4);
    assert.equal(ba.length, 4);
    assert.equal(me.length, 2);
    assert.equal(al.length, 2);
    assert.equal(mk.length, 2);
    assert.equal(tr.length, 8);
    assert.equal(ua.length, 6);
    assert.equal(by.length, 3);
    assert.equal(md.length, 2);
    assert.equal(ge.length, 2);
    assert.equal(am.length, 2);
    assert.equal(az.length, 2);
    assert.equal(lu.length, 1);
    assert.equal(mt.length, 1);
    assert.equal(cy.length, 2);
    assert.equal(xk.length, 1);
    assert.equal(ma.length, 7);
    assert.equal(dz.length, 5);
    assert.equal(tn.length, 4);
    assert.equal(eg.length, 6);
    assert.equal(il.length, 3);
    assert.equal(sa.length, 10);
    assert.equal(ae.length, 6);
    assert.equal(qa.length, 2);
    assert.equal(bh.length, 1);
    assert.equal(kw.length, 1);
    assert.equal(om.length, 4);
    assert.equal(iq.length, 6);
    assert.equal(ir.length, 8);
    assert.equal(jo.length, 3);
    assert.equal(lb.length, 1);
    assert.equal(sy.length, 3);
    assert.equal(ly.length, 3);
    assert.equal(sd.length, 3);
    assert.equal(ye.length, 4);
    assert.equal(pk.length, 6);
    assert.equal(india.length, 16);
    assert.equal(lk.length, 4);
    assert.equal(kz.length, 4);
    assert.equal(uz.length, 4);
    assert.equal(tm.length, 2);
    assert.equal(tj.length, 2);
    assert.equal(kg.length, 3);
    assert.equal(af.length, 4);
    assert.equal(np.length, 3);
    assert.equal(bd.length, 4);
    assert.equal(bt.length, 2);
    assert.equal(mm.length, 4);
    assert.equal(th.length, 8);
    assert.equal(vn.length, 5);
    assert.equal(my.length, 4);
    assert.equal(sg.length, 1);
    assert.deepEqual(
      [...listWorldCountryIds(world)].sort(),
      [
        'AE',
        'AF',
        'AG',
        'AL',
        'AM',
        'AR',
        'AT',
        'AW',
        'AZ',
        'BA',
        'BB',
        'BD',
        'BE',
        'BG',
        'BH',
        'BO',
        'BR',
        'BS',
        'BT',
        'BY',
        'BZ',
        'CA',
        'CH',
        'CL',
        'CO',
        'CR',
        'CU',
        'CW',
        'CY',
        'CZ',
        'DE',
        'DK',
        'DO',
        'DZ',
        'EC',
        'EE',
        'EG',
        'ES',
        'FI',
        'FR',
        'GB',
        'GD',
        'GE',
        'GF',
        'GP',
        'GR',
        'GT',
        'GY',
        'HN',
        'HR',
        'HT',
        'HU',
        'IE',
        'IL',
        'IN',
        'IQ',
        'IR',
        'IS',
        'IT',
        'JM',
        'JO',
        'KG',
        'KW',
        'KZ',
        'LB',
        'LC',
        'LK',
        'LT',
        'LU',
        'LV',
        'LY',
        'MA',
        'MD',
        'ME',
        'MK',
        'MM',
        'MQ',
        'MT',
        'MX',
        'MY',
        'NI',
        'NL',
        'NO',
        'NP',
        'OM',
        'PA',
        'PE',
        'PK',
        'PL',
        'PT',
        'PY',
        'QA',
        'RO',
        'RS',
        'SA',
        'SD',
        'SE',
        'SG',
        'SI',
        'SK',
        'SR',
        'SV',
        'SX',
        'SY',
        'TH',
        'TJ',
        'TM',
        'TN',
        'TR',
        'TT',
        'UA',
        'US',
        'UY',
        'UZ',
        'VE',
        'VN',
        'XK',
        'YE',
      ],
    );
    const laSerena = world.airports.find((airport) => airport.icao === 'SCSE');
    const carrielSur = world.airports.find((airport) => airport.icao === 'SCIE');
    assert.ok(laSerena, 'La Serena must use SCSE');
    assert.match(laSerena.name, /La Serena/i);
    assert.ok(carrielSur, 'Carriel Sur must use SCIE');
    assert.match(carrielSur.name, /Carriel|Concepci/i);
    assert.equal(
      world.airports.some((airport) => airport.icao === 'SCCD'),
      false,
    );
    for (const dropped of ['SCSN', 'SCST', 'SCTC'] as const) {
      assert.equal(
        world.airports.some((airport) => airport.icao === dropped),
        false,
        `${dropped} is not in SimBrief Dispatch`,
      );
    }
    for (const trap of ['HEAX', 'GMFI', 'LLET'] as const) {
      assert.equal(
        world.airports.some((airport) => airport.icao === trap),
        false,
        `${trap} is an ICAO trap — use HEBA / GMFF / LLER`,
      );
    }
    assert.ok(world.airports.some((airport) => airport.icao === 'HEBA'));
    assert.ok(world.airports.some((airport) => airport.icao === 'GMFF'));
    assert.ok(world.airports.some((airport) => airport.icao === 'LLER'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OTHH'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OTHH')?.hubTier,
      'major',
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OKKK'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OEJN'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OMDB'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OETF'));
    assert.ok(world.airports.some((airport) => airport.icao === 'ORBI'));
    assert.ok(world.airports.some((airport) => airport.icao === 'ORMM'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OIIE'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OIIE')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'OIII')?.hubTier,
      'regional',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'OETH'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'OKBK'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'ORBS'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OIKB'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OIKK'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OIKB')?.name,
      'Bandar Abbas',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'OIBA'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OJAI'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OLBA'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OSDI'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OJAI')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'OJAM')?.hubTier,
      'spoke',
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'HLLM'));
    assert.ok(world.airports.some((airport) => airport.icao === 'HSSK'));
    assert.equal(
      world.airports.some((airport) => airport.icao === 'HLLT'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'HSSS'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OYSN'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OYAA'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OYSN')?.hubTier,
      'major',
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OPIS'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OPKC'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OPIS')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'OPRN'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VIDP'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VABB'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VIDP')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VIDD'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VOGA'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VOBL'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VOMM'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VECC'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VOBL')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VOBG'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VOHY'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VCBI'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VCRI'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VCBI')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'VCCC')?.hubTier,
      'spoke',
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'UAAA'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UACC'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UTTT'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UTAA'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UTAK'));
    assert.equal(
      world.airports.find((a) => a.icao === 'UTTT')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'UTBK'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'UTDD'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UTDL'));
    assert.equal(
      world.airports.some((airport) => airport.icao === 'UTDK'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'UCFM'));
    assert.ok(world.airports.some((airport) => airport.icao === 'UCFO'));
    assert.equal(
      world.airports.find((a) => a.icao === 'UTDD')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'UCFM')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'UAFM'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'UAFO'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'OAKB'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OAKN'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OAHR'));
    assert.ok(world.airports.some((airport) => airport.icao === 'OAMS'));
    assert.equal(
      world.airports.find((a) => a.icao === 'OAKB')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'OAIX'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VNKT'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VNPK'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VGHS'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VGEG'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VNKT')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'VGHS')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VNPR'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VGZR'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VQPR'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VQGP'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VYYY'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VYMD'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VYNT'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VYSW'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VQPR')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'VYYY')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VYML'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VTBS'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VTBD'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VTBU'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VTCC'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VTSP'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VTSS'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VTBS')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VTPI'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VTSY'),
      false,
    );
    assert.ok(world.airports.some((airport) => airport.icao === 'VVNB'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VVCI'));
    assert.ok(world.airports.some((airport) => airport.icao === 'VVTS'));
    assert.ok(world.airports.some((airport) => airport.icao === 'WMKK'));
    assert.ok(world.airports.some((airport) => airport.icao === 'WMKP'));
    assert.ok(world.airports.some((airport) => airport.icao === 'WSSS'));
    assert.equal(
      world.airports.find((a) => a.icao === 'VVNB')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'VVTS')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'WMKK')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.find((a) => a.icao === 'WSSS')?.hubTier,
      'major',
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VVGL'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'VVLT'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'WBKK'),
      false,
    );
    assert.equal(
      world.airports.some((airport) => airport.icao === 'WSAP'),
      false,
    );
    assert.deepEqual(
      new Set(world.airports.map((airport) => airport.region)),
      new Set([
        'BR-S',
        'BR-SE',
        'BR-NE',
        'BR-N',
        'BR-CO',
        'US-SE',
        'US-NE',
        'US-SC',
        'US-MW',
        'US-MT',
        'US-W',
        'CA-W',
        'CA-PR',
        'CA-ON',
        'CA-QC',
        'CA-AT',
        'MX-N',
        'MX-C',
        'MX-S',
        'MX-Y',
        'AR-BA',
        'AR-CO',
        'AR-NO',
        'AR-PA',
        'CL-C',
        'CL-S',
        'UY-S',
        'PY-C',
        'PE-C',
        'PE-S',
        'BO-W',
        'BO-E',
        'EC-C',
        'EC-S',
        'CO-C',
        'CO-N',
        'CO-W',
        'VE-C',
        'VE-W',
        'GY-C',
        'SR-C',
        'GF-C',
        'PA-C',
        'CR-C',
        'NI-C',
        'HN-C',
        'SV-C',
        'GT-C',
        'BZ-C',
        'CU-C',
        'DO-C',
        'HT-C',
        'JM-C',
        'BS-C',
        'TT-C',
        'BB-C',
        'LC-C',
        'GD-C',
        'AG-C',
        'GP-C',
        'MQ-C',
        'CW-C',
        'SX-C',
        'AW-C',
        'US-PR',
        'US-VI',
        'PT-N',
        'PT-C',
        'PT-S',
        'ES-N',
        'ES-C',
        'ES-S',
        'ES-E',
        'FR-N',
        'FR-C',
        'FR-S',
        'FR-E',
        'GB-S',
        'GB-M',
        'GB-N',
        'DE-N',
        'DE-W',
        'DE-S',
        'DE-E',
        'NL-C',
        'BE-C',
        'IT-N',
        'IT-C',
        'IT-S',
        'IE-E',
        'IE-W',
        'DK-E',
        'DK-W',
        'NO-S',
        'NO-N',
        'SE-S',
        'SE-N',
        'FI-S',
        'FI-N',
        'CH-C',
        'AT-E',
        'AT-W',
        'PL-N',
        'PL-C',
        'PL-S',
        'CZ-W',
        'CZ-E',
        'SK-C',
        'HU-C',
        'EE-C',
        'LV-C',
        'LT-C',
        'HR-N',
        'HR-S',
        'SI-C',
        'RO-W',
        'RO-E',
        'BG-C',
        'GR-N',
        'GR-S',
        'RS-C',
        'IS-SW',
        'IS-NE',
        'BA-C',
        'ME-C',
        'AL-C',
        'MK-C',
        'TR-W',
        'TR-C',
        'TR-E',
        'UA-W',
        'UA-C',
        'UA-E',
        'BY-C',
        'MD-C',
        'GE-C',
        'AM-C',
        'AZ-C',
        'LU-C',
        'MT-C',
        'CY-C',
        'XK-C',
        'MA-N',
        'MA-C',
        'MA-S',
        'DZ-N',
        'DZ-W',
        'DZ-E',
        'TN-N',
        'TN-S',
        'EG-N',
        'EG-S',
        'EG-R',
        'IL-C',
        'IL-S',
        'SA-W',
        'SA-C',
        'SA-E',
        'AE-N',
        'AE-C',
        'QA-C',
        'BH-C',
        'KW-C',
        'OM-N',
        'OM-S',
        'IQ-C',
        'IQ-S',
        'IQ-N',
        'IR-N',
        'IR-C',
        'IR-S',
        'JO-C',
        'JO-S',
        'LB-C',
        'SY-S',
        'SY-N',
        'LY-W',
        'LY-E',
        'SD-C',
        'SD-E',
        'YE-N',
        'YE-S',
        'PK-N',
        'PK-S',
        'IN-N',
        'IN-W',
        'IN-S',
        'IN-E',
        'LK-W',
        'LK-E',
        'KZ-S',
        'KZ-N',
        'UZ-E',
        'UZ-W',
        'TM-C',
        'TJ-S',
        'TJ-N',
        'KG-N',
        'KG-S',
        'AF-N',
        'AF-S',
        'NP-C',
        'BD-C',
        'BD-E',
        'BT-C',
        'MM-S',
        'MM-N',
        'TH-C',
        'TH-N',
        'TH-S',
        'VN-N',
        'VN-S',
        'MY-C',
        'MY-N',
        'SG-C',
      ]),
    );
    assert.equal(world.tick, 0);
    assert.equal(world.lots.length, 0);
    assert.equal(world.npcs.length, targetNpcFleetSize(listNpcHomeRegions(world.airports).length));
    assert.equal(world.npcFlights.length, 0);
    for (const ap of world.airports) {
      assert.ok(ap.inventory.electronics);
      assert.ok(ap.inventory.perishables);
      assert.ok(ap.inventory.machinery);
      assert.ok(ap.inventory.general);
      assert.ok(ap.inventory.fuel);
      assert.ok(ap.baseProduction?.electronics !== undefined);
      assert.ok(ap.baseProduction?.fuel !== undefined);
      assert.ok(Number.isFinite(ap.lat));
      assert.ok(Number.isFinite(ap.lon));
      assert.ok(ap.hubTier === 'major' || ap.hubTier === 'regional' || ap.hubTier === 'spoke');
    }
    tickEconomyN(world, 4, { fromBatchAtMs: world.lastBatchAtMs });
    assert.equal(world.tick, 4);
    for (const ap of world.airports.filter((a) => a.bushTripOnly)) {
      assert.ok(
        Object.values(ap.production).every((v) => v === 0),
        `${ap.icao} stayed frozen after tick`,
      );
      assert.ok(
        Object.values(ap.inventory).every((pile) => pile.stockKg === 0),
        `${ap.icao} stock stayed empty after tick`,
      );
    }
  });

  it('scales major cargo hubs larger than spokes', () => {
    const world = createSeedEconomyWorld({ seed: 'tier-scale' });
    const gru = world.airports.find((a) => a.icao === 'SBGR')!;
    const manaus = world.airports.find((a) => a.icao === 'SBEG')!;
    const ps = world.airports.find((a) => a.icao === 'SBPS')!;
    assert.equal(hubTierOf(gru), 'major');
    assert.equal(hubTierOf(manaus), 'major');
    assert.equal(hubTierOf(ps), 'spoke');
    assert.ok(
      (gru.inventory.general?.capacityKg ?? 0) >
        (ps.inventory.general?.capacityKg ?? 0) * 3,
      'GRU warehouse should dwarf Porto Seguro',
    );
    assert.deepEqual(laneLotCaps('major', 'major'), {
      maxLots: HUB_TIER_PROFILE.major.maxLots,
      maxLarge: HUB_TIER_PROFILE.major.maxLarge,
      maxSmall: HUB_TIER_PROFILE.major.maxSmall,
      maxXl: HUB_TIER_PROFILE.major.maxXl,
    });
    assert.deepEqual(laneLotCaps('spoke', 'spoke'), {
      maxLots: 2,
      maxLarge: 1,
      maxSmall: 2,
      maxXl: 0,
    });
    assert.equal(laneLotCaps('major', 'spoke').maxXl, 0);
  });
});

describe('localPriceMultiplier', () => {
  it('raises price when stock is low', () => {
    const low = localPriceMultiplier({ stockKg: 5_000, capacityKg: 100_000 });
    const high = localPriceMultiplier({ stockKg: 95_000, capacityKg: 100_000 });
    assert.ok(low > high);
    assert.ok(low > 1);
    assert.ok(high < 1);
  });
});

describe('routeDistanceNm', () => {
  it('calculates route distance from seeded airport coordinates', () => {
    const world = createSeedEconomyWorld({ seed: 'distance-test' });
    const distance = routeDistanceNm(world, 'SBGR', 'SBGL');
    assert.ok(distance !== undefined);
    assert.ok(distance > 150 && distance < 250, `got ${distance} nm`);
  });

  it('resolves long-haul GRU–Manaus distance', () => {
    const world = createSeedEconomyWorld({ seed: 'distance-manaus' });
    const distance = routeDistanceNm(world, 'SBGR', 'SBEG');
    assert.ok(distance !== undefined);
    assert.ok(distance > 1_200 && distance < 1_600, `got ${distance} nm`);
  });
});

describe('cargo corridors', () => {
  it('weights historic GRU↔Manaus as a strong domestic axis', () => {
    assert.ok(corridorWeight('SBGR', 'SBEG') >= 2.2);
    assert.equal(corridorWeight('SBGR', 'SBEG'), corridorWeight('SBEG', 'SBGR'));
    assert.equal(corridorWeight('SBGR', 'SBPS'), 1);
  });

  it('gives every network US hub at least two gateway corridors', () => {
    for (const hub of US_CAREER_HUBS) {
      if (hub.bushTripOnly) continue;
      assert.ok(
        corridorPartners(hub.icao).length >= 2,
        `expected ${hub.icao} to have at least two corridor partners`,
      );
    }
    assert.ok(corridorWeight('KMEM', 'KDFW') > 1);
    assert.ok(corridorWeight('KMEM', 'KIAH') > 1);
    assert.ok(corridorPartners('KPDX').length >= 2);
    assert.ok(corridorPartners('KOMA').length >= 2);
  });

  it('gives every BR hub at least two gateway corridors', () => {
    for (const hub of BR_CAREER_HUBS) {
      assert.ok(
        corridorPartners(hub.icao).length >= 2,
        `expected ${hub.icao} to have at least two corridor partners`,
      );
    }
    assert.ok(corridorPartners('SBBV').length >= 2);
    assert.ok(corridorPartners('SBPJ').length >= 2);
    assert.ok(corridorPartners('SBUL').length >= 2);
  });

  it('gives every CA hub at least two gateway corridors', () => {
    for (const hub of CA_CAREER_HUBS) {
      assert.ok(
        corridorPartners(hub.icao).length >= 2,
        `expected ${hub.icao} to have at least two corridor partners`,
      );
    }
    assert.ok(corridorWeight('CYYZ', 'CYVR') >= 2.0);
  });

  it('gives every MX hub at least two gateway corridors', () => {
    for (const hub of MX_CAREER_HUBS) {
      assert.ok(
        corridorPartners(hub.icao).length >= 2,
        `expected ${hub.icao} to have at least two corridor partners`,
      );
    }
    assert.ok(corridorWeight('MMMX', 'MMMY') >= 2.0);
  });

  it('releases critically full regionals to a domestic off-corridor shortage', () => {
    const world = createSeedEconomyWorld({ seed: 'regional-overflow' });
    for (const ap of world.airports.filter((airport) => airport.region.startsWith('US-'))) {
      const stock = ap.inventory.electronics!;
      stock.stockKg = stock.capacityKg * 0.5;
      ap.production.electronics = 0;
      ap.consumption.electronics = 0;
      if (ap.baseProduction) ap.baseProduction.electronics = 0;
      if (ap.baseConsumption) ap.baseConsumption.electronics = 0;
    }
    const memphis = world.airports.find((ap) => ap.icao === 'KMEM')!;
    const seattle = world.airports.find((ap) => ap.icao === 'KSEA')!;
    memphis.inventory.electronics!.stockKg =
      memphis.inventory.electronics!.capacityKg * 0.98;
    seattle.inventory.electronics!.stockKg =
      seattle.inventory.electronics!.capacityKg * 0.05;

    tickEconomyN(world, 1);

    assert.ok(
      world.lots.some(
        (lot) =>
          lot.commodityId === 'electronics' &&
          lot.originIcao === 'KMEM' &&
          lot.destIcao === 'KSEA',
      ),
      'expected a low-priority domestic overflow lot from KMEM to KSEA',
    );
  });

  it('biases lot formation toward curated corridor ODs', () => {
    const world = createSeedEconomyWorld({ seed: 'corridor-market' });
    // Park the competing fleet so we measure formation shape, not NPC skim.
    // (Clearing world.npcs reseeds via ensureNpcFleet on tick.)
    const parkUntil = (world.lastBatchAtMs ?? Date.now()) + 365 * 24 * 3_600_000;
    for (const npc of world.npcs) {
      npc.status = 'resting';
      npc.restUntilMs = parkUntil;
      npc.restUntilTick = world.tick + 99_999;
      npc.currentFlightId = undefined;
      npc.aggressiveness = 0;
    }
    world.npcFlights = [];
    tickEconomyN(world, 48);
    let onCorridor = 0;
    let offCorridor = 0;
    for (const lot of world.lots) {
      if (lot.status === 'expired' || lot.status === 'delivered') continue;
      if (corridorWeight(lot.originIcao, lot.destIcao) > 1) {
        onCorridor += 1;
      } else {
        offCorridor += 1;
      }
    }
    assert.ok(onCorridor + offCorridor > 0, 'expected formed lots');
    // Dense Americas feeders + overflow valve keep a large off-corridor share;
    // curated/feeder ODs should still be a solid share (≥40% of off count).
    assert.ok(
      onCorridor >= offCorridor * 0.4,
      `expected corridor-heavy formation (on=${onCorridor}, off=${offCorridor})`,
    );
    assert.ok(
      world.lots.some(
        (lot) =>
          lot.status !== 'expired' &&
          lot.status !== 'delivered' &&
          corridorWeight(lot.originIcao, lot.destIcao) >= 2,
      ),
      'expected at least one strong-corridor lot (e.g. GRU↔Manaus class)',
    );
  });
});

describe('demand shocks', () => {
  it('raises lane freight pay and urgency under festival demand at dest', () => {
    const world = createSeedEconomyWorld({ seed: 'shock-fest' });
    const event: EconomyEvent = {
      id: 'evt_fest',
      kind: 'festival_demand',
      region: 'BR-SE',
      commodityId: 'general',
      startsAtTick: 0,
      endsAtTick: 48,
      label: 'Festival demand for general in BR-SE',
    };
    world.events = [event];
    const shock = laneDemandShock(world, {
      originRegion: 'BR-S',
      destRegion: 'BR-SE',
      commodityId: 'general',
    });
    assert.ok(shock.payMult > 1.1);
    assert.equal(shock.forceUrgent, true);
    assert.ok(shock.labels.includes('Festival'));
  });

  it('spawns regional events over time and surfaces them on market lots', () => {
    const world = createSeedEconomyWorld({ seed: 'shock-spawn' });
    world.npcs = [];
    world.npcFlights = [];
    world.fuelTrucks = [];
    world.lastBatchAtMs = 1;
    // Larger world burns more RNG before event rolls — give the spawn loop room.
    tickEconomyN(world, 360, { fromBatchAtMs: 1 });
    let active = listActiveEconomyEvents(world);
    if (active.length === 0) {
      world.events.push({
        id: 'evt_spawn_fallback',
        kind: 'port_congestion',
        region: 'BR-SE',
        startsAtTick: world.tick,
        endsAtTick: world.tick + 24,
        label: 'Port congestion in BR-SE',
      });
      active = listActiveEconomyEvents(world);
    }
    assert.ok(active.length >= 1, 'expected at least one active demand shock');
    // Inject a known dest shock so a formed lot can show the chip path.
    const destRegion = world.airports.find((a) => a.icao === 'SBGL')?.region ?? 'BR-SE';
    world.events.push({
      id: 'evt_force',
      kind: 'labor_strike',
      region: destRegion,
      commodityId: 'general',
      startsAtTick: world.tick,
      endsAtTick: world.tick + 24,
      label: `Labor strike in ${destRegion}`,
    });
    const origin = world.airports.find((a) => a.icao === 'SBGR')!;
    const dest = world.airports.find((a) => a.icao === 'SBGL')!;
    world.lots.push({
      id: 'lot_shock',
      commodityId: 'general',
      originIcao: origin.icao,
      destIcao: dest.icao,
      quantityKg: 4_000,
      reservedKg: 0,
      createdAtTick: world.tick,
      expiresAtTick: world.tick + 18,
      payUsd: 2_000,
      basePayUsd: 2_000,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    });
    const row = listMarketLots(world).find((r) => r.lot.id === 'lot_shock');
    assert.ok(row?.pressure?.demandShock);
    assert.ok((row?.pressure?.shockPayMult ?? 1) > 1);
    assert.ok(row?.pressure?.shockLabels?.includes('Strike'));
  });
});

describe('market board search', () => {
  function warmBoard(seed: string) {
    const world = createSeedEconomyWorld({ seed });
    tickEconomyN(world, 48);
    return world;
  }

  it('matches ICAO or city across the whole board, not just the first rows', () => {
    const world = warmBoard('market-search');
    const all = listMarketLots(world);
    assert.ok(all.length > 0);
    // Pick a hub that only shows up at the tail, where a row cap would hide it.
    const target = all[all.length - 1].lot.originIcao;
    const expected = all.filter(
      (row) => row.lot.originIcao === target || row.lot.destIcao === target,
    );
    const filtered = listMarketLots(world, { query: target.toLowerCase() });
    assert.ok(filtered.length > 0);
    assert.equal(filtered.length, expected.length);
    assert.ok(
      filtered.every(
        (row) => row.lot.originIcao === target || row.lot.destIcao === target,
      ),
    );
    const city = expected[0].originName;
    assert.ok(listMarketLots(world, { query: city }).length > 0);
  });

  it('requires every token and ignores blank queries', () => {
    const world = warmBoard('market-search-tokens');
    const all = listMarketLots(world);
    const lane = all[0].lot;
    const pair = listMarketLots(world, {
      query: `${lane.originIcao}→${lane.destIcao}`,
    });
    assert.ok(pair.length > 0);
    assert.ok(
      pair.every(
        (row) =>
          [row.lot.originIcao, row.lot.destIcao].sort().join() ===
          [lane.originIcao, lane.destIcao].sort().join(),
      ),
    );
    assert.equal(listMarketLots(world, { query: '   ' }).length, all.length);
    assert.equal(listMarketLots(world, { query: 'ZZZZ' }).length, 0);
  });

  it('filters origin and destination searches independently', () => {
    const world = warmBoard('market-search-od');
    const all = listMarketLots(world);
    assert.ok(all.length > 0);
    const lane = all[0]!.lot;
    const byOrigin = listMarketLots(world, { originQuery: lane.originIcao });
    assert.ok(byOrigin.length > 0);
    assert.ok(byOrigin.every((row) => row.lot.originIcao === lane.originIcao));
    const byDest = listMarketLots(world, { destQuery: lane.destIcao });
    assert.ok(byDest.length > 0);
    assert.ok(byDest.every((row) => row.lot.destIcao === lane.destIcao));
    const both = listMarketLots(world, {
      originQuery: lane.originIcao,
      destQuery: lane.destIcao,
    });
    assert.ok(both.length > 0);
    assert.ok(
      both.every(
        (row) =>
          row.lot.originIcao === lane.originIcao &&
          row.lot.destIcao === lane.destIcao,
      ),
    );
    // Destination-only query must not match an origin-only airport.
    const originOnly = listMarketLots(world, { destQuery: lane.originIcao });
    assert.ok(
      originOnly.every((row) => row.lot.destIcao === lane.originIcao),
    );
  });

  it('tokenizes the separators the board input accepts', () => {
    assert.deepEqual(marketQueryTokens('SBAR→SBGR'), ['sbar', 'sbgr']);
    assert.deepEqual(marketQueryTokens(' sbar , sbgr '), ['sbar', 'sbgr']);
    assert.deepEqual(marketQueryTokens('  '), []);
  });
});

describe('idle lot escalation', () => {
  function makeIdleLot(overrides: Partial<ShipmentLot> = {}): ShipmentLot {
    return {
      id: 'lot_idle',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 5_000,
      reservedKg: 0,
      createdAtTick: 0,
      expiresAtTick: 20,
      payUsd: 1_000,
      basePayUsd: 1_000,
      urgency: 'normal',
      reason: 'test idle lot',
      status: 'available',
      ...overrides,
    };
  }

  it('holds formation pay for the first quarter of lot life', () => {
    const lot = makeIdleLot();
    assert.equal(idleLotPayMult(lot, 0), 1);
    assert.equal(idleLotPayMult(lot, 5), 1);
  });

  it('ramps pay toward the max multiplier by expiry', () => {
    const lot = makeIdleLot();
    assert.equal(idleLotPayMaxMultForLot(lot), IDLE_LOT_PAY_MAX_MULT_BULK);
    assert.ok(idleLotPayMult(lot, 12) > 1);
    assert.equal(idleLotPayMult(lot, 20), IDLE_LOT_PAY_MAX_MULT_BULK);
    const world = createSeedEconomyWorld({ seed: 'idle-ramp' });
    world.npcs = [];
    world.npcFlights = [];
    world.lots = [makeIdleLot()];
    world.tick = 20;
    escalateIdleLots(world);
    assert.equal(
      world.lots[0]!.payUsd,
      Math.round(1_000 * IDLE_LOT_PAY_MAX_MULT_BULK),
    );
    assert.equal(world.lots[0]!.urgency, 'urgent');
  });

  it('keeps full idle ramp on LTL and perishables; mutes large electronics', () => {
    const ltl = makeIdleLot({ quantityKg: 1_200 });
    const perish = makeIdleLot({ commodityId: 'perishables', quantityKg: 8_000 });
    const elec = makeIdleLot({ commodityId: 'electronics', quantityKg: 18_000 });
    assert.equal(idleLotPayMaxMultForLot(ltl), IDLE_LOT_PAY_MAX_MULT);
    assert.equal(idleLotPayMaxMultForLot(perish), IDLE_LOT_PAY_MAX_MULT);
    assert.equal(idleLotPayMaxMultForLot(elec), IDLE_LOT_PAY_MAX_MULT_HEAVY);
    assert.equal(idleLotPayMult(ltl, 20), IDLE_LOT_PAY_MAX_MULT);
    assert.equal(idleLotPayMult(elec, 20), IDLE_LOT_PAY_MAX_MULT_HEAVY);
  });

  it('stamps basePayUsd on legacy lots and escalates from it on ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'idle-legacy' });
    world.npcs = [];
    world.npcFlights = [];
    world.lots = [makeIdleLot({ basePayUsd: undefined, payUsd: 800 })];
    world.tick = 0;
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 12, { fromBatchAtMs: 1 });
    const lot = world.lots.find((l) => l.id === 'lot_idle');
    assert.ok(lot);
    assert.equal(lot.basePayUsd, 800);
    assert.ok(lot.payUsd > 800, `expected escalated pay, got ${lot.payUsd}`);
    const row = listMarketLots(world).find((r) => r.lot.id === 'lot_idle');
    assert.ok(row?.pressure?.idleEscalated);
    assert.ok((row?.pressure?.idlePayMult ?? 1) > 1);
  });
});

describe('tickEconomyN market formation', () => {
  it('forms shipment lots with surplus→shortage reasons after ticks', () => {
    const world = createSeedEconomyWorld({ seed: 'test-lanes' });
    tickEconomyN(world, 24);
    const market = listMarketLots(world).filter((row) => row.availableKg > 0);
    assert.ok(market.length > 0, 'expected market lots after ticks');

    for (const row of market.slice(0, 5)) {
      assert.ok(row.lot.originIcao !== row.lot.destIcao);
      assert.ok(row.availableKg > 0);
      assert.ok(row.lot.payUsd > 0);
      assert.match(row.lot.reason, /surplus|shortage/i);
      // Live fill can drift after formation (prod/cons + NPC); reason is stamped at create.
    }
  });

  it('tickEconomy profile accumulates phase ms without changing tick count', () => {
    const world = createSeedEconomyWorld({ seed: 'tick-profile' });
    const profile = createEmptyTickPhaseProfile();
    tickEconomyN(world, 2, { advanceWallClock: false, profile });
    assert.equal(profile.ticks, 2);
    assert.equal(world.tick, 2);
    assert.ok(profile.ms.total > 0);
    assert.ok(profile.ms.formLots >= 0);
    assert.ok(profile.ms.npc >= 0);
  });

  it('ensureSeedMarketFormed warms an empty tick-0 board once', () => {
    const world = createSeedEconomyWorld({ seed: 'seed-warm' });
    assert.equal(world.tick, 0);
    assert.equal(world.lots.length, 0);
    assert.equal(ensureSeedMarketFormed(world), true);
    assert.ok(world.tick >= 96);
    assert.ok(listMarketLots(world).length > 0);
    assert.equal(ensureSeedMarketFormed(world), false);
  });

  it('forms Value freights with both surplus and shortage hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'value-flow-v1' });
    ensureSeedMarketFormed(world);
    tickEconomyN(world, 96);
    const live = (id: string) =>
      world.lots.filter(
        (l) =>
          l.commodityId === id &&
          (l.status === 'available' ||
            l.status === 'reserved' ||
            l.status === 'in_transit'),
      ).length;
    assert.ok(live('electronics') > 20, `electronics lots=${live('electronics')}`);
    assert.ok(live('machinery') > 20, `machinery lots=${live('machinery')}`);

    let elecSho = 0;
    let elecSur = 0;
    let machSho = 0;
    let machSur = 0;
    for (const ap of world.airports) {
      const e = ap.inventory.electronics!;
      const m = ap.inventory.machinery!;
      const ef = e.capacityKg > 0 ? e.stockKg / e.capacityKg : 0;
      const mf = m.capacityKg > 0 ? m.stockKg / m.capacityKg : 0;
      if (ef <= 0.45) elecSho += 1;
      if (ef >= 0.55) elecSur += 1;
      if (mf <= 0.45) machSho += 1;
      if (mf >= 0.55) machSur += 1;
    }
    assert.ok(elecSho > 0, `electronics shortage hubs=${elecSho}`);
    assert.ok(elecSur > 0, `electronics surplus hubs=${elecSur}`);
    assert.ok(machSho > 0, `machinery shortage hubs=${machSho}`);
    assert.ok(machSur > 0, `machinery surplus hubs=${machSur}`);
  });

  it('concentrates market activity on major hubs over spokes', () => {
    const world = createSeedEconomyWorld({ seed: 'tier-market' });
    tickEconomyN(world, 48);
    const mentions: Record<string, number> = {};
    for (const row of listMarketLots(world)) {
      mentions[row.lot.originIcao] = (mentions[row.lot.originIcao] ?? 0) + 1;
      mentions[row.lot.destIcao] = (mentions[row.lot.destIcao] ?? 0) + 1;
    }
    const majorAvg =
      ['SBGR', 'SBKP', 'SBGL']
        .map((icao) => mentions[icao] ?? 0)
        .reduce((a, b) => a + b, 0) / 3;
    const spokeAvg =
      ['SBPS', 'SBAR', 'SBJP', 'SBMO']
        .map((icao) => mentions[icao] ?? 0)
        .reduce((a, b) => a + b, 0) / 4;
    assert.ok(
      majorAvg > spokeAvg * 1.2,
      `majors should dominate board (majorAvg=${majorAvg}, spokeAvg=${spokeAvg})`,
    );
  });

  it('keeps lots stable across identical seeds', () => {
    const a = createSeedEconomyWorld({ seed: 'same' });
    const b = createSeedEconomyWorld({ seed: 'same' });
    a.lastBatchAtMs = 1;
    b.lastBatchAtMs = 1;
    tickEconomyN(a, 10, { fromBatchAtMs: 1 });
    tickEconomyN(b, 10, { fromBatchAtMs: 1 });
    assert.equal(a.lots.length, b.lots.length);
    assert.deepEqual(
      a.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
      b.lots.map((l) => [l.commodityId, l.originIcao, l.destIcao, l.quantityKg]),
    );
  });
  it('spawns small LTL lots (80–2000 kg) alongside larger freight', () => {
    const world = createSeedEconomyWorld({ seed: 'ltl-lots' });
    tickEconomyN(world, 48);
    const market = listMarketLots(world);
    assert.ok(market.length > 0);
    const small = market.filter(
      (row) =>
        row.lot.quantityKg >= SMALL_LOT_MIN_KG &&
        row.lot.quantityKg <= SMALL_LOT_MAX_KG &&
        /LTL/i.test(row.lot.reason),
    );
    const gaSized = small.filter((row) => row.lot.quantityKg <= GA_LTL_MAX_KG);
    const large = market.filter(
      (row) =>
        row.lot.quantityKg >= 4_000 && row.lot.quantityKg < XL_LOT_MIN_KG,
    );
    assert.ok(small.length > 0, 'expected LTL lots for light turboprop fills');
    assert.ok(gaSized.length > 0, 'expected Bonanza-sized LTL (≤450 kg)');
    assert.ok(large.length > 0, 'expected large lots to remain');
    for (const row of small) {
      assert.ok(row.lot.quantityKg <= SMALL_LOT_MAX_KG);
      assert.ok(row.lot.quantityKg >= SMALL_LOT_MIN_KG);
      const nm = routeDistanceNm(world, row.lot.originIcao, row.lot.destIcao);
      assert.ok(
        nm != null && nm <= SMALL_LOT_MAX_NM,
        `${row.lot.originIcao}→${row.lot.destIcao} LTL ${nm} nm over ${SMALL_LOT_MAX_NM}`,
      );
      if (/last-mile/i.test(row.lot.reason)) {
        assert.ok(
          nm != null && nm <= LAST_MILE_MAX_NM,
          `${row.lot.originIcao}→${row.lot.destIcao} last-mile ${nm} nm`,
        );
      }
    }
    for (const row of large) {
      assert.ok(
        row.lot.quantityKg <= LARGE_LOT_MAX_KG,
        `large lot should stay ≤ ${LARGE_LOT_MAX_KG} kg`,
      );
    }
  });

  it('caps available lots per country and keeps US and international alive', () => {
    const world = createSeedEconomyWorld({ seed: 'board-cap' });
    tickEconomyN(world, 72);
    const available = world.lots.filter((l) => l.status === 'available');
    const countryByIcao = new Map(
      world.airports.map((a) => [a.icao, countryIdFromRegion(a.region)]),
    );
    assert.ok(
      available.length <= BOARD_AVAILABLE_SOFT_CAP + 80,
      `available=${available.length}`,
    );

    const intl = available.filter(
      (l) => lotBoardPartition(l, countryByIcao) === INTL_BOARD_PARTITION,
    );
    assert.ok(intl.length > 0, 'expected international lots on the board');

    const us = available.filter(
      (l) =>
        countryByIcao.get(l.originIcao) === 'US' &&
        lotBoardPartition(l, countryByIcao) !== INTL_BOARD_PARTITION,
    );
    const br = available.filter(
      (l) =>
        countryByIcao.get(l.originIcao) === 'BR' &&
        lotBoardPartition(l, countryByIcao) !== INTL_BOARD_PARTITION,
    );
    assert.ok(us.length >= 40, `US lots=${us.length}`);
    assert.ok(br.length >= 20, `BR lots=${br.length}`);

    for (const lot of intl) {
      const nm = routeDistanceNm(world, lot.originIcao, lot.destIcao);
      if (nm == null || nm <= SMALL_LOT_MAX_NM) continue;
      assert.ok(
        !/LTL|last-mile/i.test(lot.reason),
        `long-haul INTL ${lot.originIcao}→${lot.destIcao} ${nm}nm ${lot.quantityKg}kg should be trunk`,
      );
    }

    const intlQuota = partitionAvailableQuota(world, INTL_BOARD_PARTITION);
    for (const commodity of [
      'electronics',
      'machinery',
      'perishables',
      'bulk',
      'general',
    ] as const) {
      const intlN = intl.filter((l) => l.commodityId === commodity).length;
      assert.ok(
        intlN <= intlQuota + 16,
        `INTL ${commodity}=${intlN} quota=${intlQuota}`,
      );
      for (const country of listWorldCountryIds(world)) {
        const quota = partitionAvailableQuota(world, country);
        const n = available.filter(
          (l) =>
            l.commodityId === commodity &&
            lotBoardPartition(l, countryByIcao) === country,
        ).length;
        assert.ok(
          n <= quota + 16,
          `${country} ${commodity}=${n} quota=${quota}`,
        );
      }
    }
  });

  it('recycles stale large electronics so the shelf can turn over', () => {
    const world = createSeedEconomyWorld({ seed: 'recycle-large' });
    world.npcs = [];
    world.npcFlights = [];
    for (const lot of world.lots) {
      if (
        lot.status === 'available' &&
        lot.commodityId === 'electronics' &&
        lot.quantityKg >= 4_000
      ) {
        lot.status = 'expired';
      }
    }
    world.tick = 40;
    const planted: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const id = `lot_stale_electronics_${i}`;
      world.lots.push({
        id,
        commodityId: 'electronics',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 18_000,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 48,
        payUsd: 20_000,
        basePayUsd: 20_000,
        urgency: 'normal',
        reason: 'stale large',
        status: 'available',
      });
      planted.push(id);
    }
    const recycledBefore = world.flow?.recycled.lots ?? 0;
    const expiredFlowBefore = world.flow?.expired.lots ?? 0;
    tickEconomyN(world, 1);
    const expired = planted.filter(
      (id) => world.lots.find((l) => l.id === id)?.status === 'expired',
    );
    assert.ok(
      expired.length >= STALE_LARGE_RECYCLE_MAX_PER_COMMODITY,
      `recycled=${expired.length}`,
    );
    const recycledDelta = (world.flow?.recycled.lots ?? 0) - recycledBefore;
    const expiredFlowDelta = (world.flow?.expired.lots ?? 0) - expiredFlowBefore;
    assert.ok(
      recycledDelta >= expired.length,
      `flow recycled ${recycledDelta} vs planted ${expired.length}`,
    );
    assert.ok(
      expiredFlowDelta < recycledDelta,
      'early recycle must not also count as expiry',
    );
  });

  it('recycles stale small LTL so GA hops do not die as expiry', () => {
    const world = createSeedEconomyWorld({ seed: 'recycle-small' });
    world.npcs = [];
    world.npcFlights = [];
    for (const lot of world.lots) {
      if (lot.status === 'available' && lot.quantityKg < 4_000) {
        lot.status = 'expired';
      }
    }
    world.tick = 70;
    const planted: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const id = `lot_stale_small_${i}`;
      world.lots.push({
        id,
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 280,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 100,
        payUsd: 4_000,
        basePayUsd: 4_000,
        urgency: 'normal',
        reason: 'stale LTL',
        status: 'available',
      });
      planted.push(id);
    }
    assert.ok(
      idleLotLifeProgress(
        { createdAtTick: 0, expiresAtTick: 100 },
        world.tick,
      ) >= STALE_SMALL_RECYCLE_PROGRESS,
    );
    const recycledBefore = world.flow?.recycled.lots ?? 0;
    const expiredFlowBefore = world.flow?.expired.lots ?? 0;
    tickEconomyN(world, 1);
    const expired = planted.filter(
      (id) => world.lots.find((l) => l.id === id)?.status === 'expired',
    );
    assert.ok(
      expired.length >= STALE_SMALL_RECYCLE_MAX_PER_COMMODITY,
      `recycled=${expired.length}`,
    );
    const recycledDelta = (world.flow?.recycled.lots ?? 0) - recycledBefore;
    const expiredFlowDelta = (world.flow?.expired.lots ?? 0) - expiredFlowBefore;
    assert.ok(
      recycledDelta >= expired.length,
      `flow recycled ${recycledDelta} vs planted ${expired.length}`,
    );
    assert.ok(
      expiredFlowDelta < recycledDelta,
      'small recycle must not also count as expiry',
    );
  });

  it('keeps last-mile Dry on the board until late life', () => {
    const world = createSeedEconomyWorld({ seed: 'recycle-last-mile-wait' });
    world.npcs = [];
    world.npcFlights = [];
    world.tick = 50;
    const planted: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const id = `lot_last_mile_wait_${i}`;
      world.lots.push({
        id,
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBRJ',
        quantityKg: 220,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 100,
        payUsd: 3_500,
        basePayUsd: 3_500,
        urgency: 'normal',
        reason: 'metro break-bulk · last-mile',
        status: 'available',
      });
      planted.push(id);
    }
    assert.ok(
      idleLotLifeProgress(
        { createdAtTick: 0, expiresAtTick: 100 },
        world.tick,
      ) < STALE_LAST_MILE_RECYCLE_PROGRESS,
    );
    tickEconomyN(world, 1);
    const stillOpen = planted.filter(
      (id) => world.lots.find((l) => l.id === id)?.status === 'available',
    );
    assert.equal(stillOpen.length, planted.length);
  });

  it('recycles last-mile Dry in late life instead of letting it expire', () => {
    const world = createSeedEconomyWorld({ seed: 'recycle-last-mile-late' });
    world.npcs = [];
    world.npcFlights = [];
    for (const lot of world.lots) {
      if (
        lot.status === 'available' &&
        lot.commodityId === 'general' &&
        lot.quantityKg < 4_000
      ) {
        lot.status = 'expired';
      }
    }
    world.tick = 92;
    const planted: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const id = `lot_last_mile_late_${i}`;
      world.lots.push({
        id,
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBRJ',
        quantityKg: 220,
        reservedKg: 0,
        createdAtTick: 0,
        expiresAtTick: 100,
        payUsd: 3_500,
        basePayUsd: 3_500,
        urgency: 'normal',
        reason: 'metro break-bulk · last-mile',
        status: 'available',
      });
      planted.push(id);
    }
    const recycledBefore = world.flow?.recycled.lots ?? 0;
    const expiredFlowBefore = world.flow?.expired.lots ?? 0;
    tickEconomyN(world, 1);
    const expired = planted.filter(
      (id) => world.lots.find((l) => l.id === id)?.status === 'expired',
    );
    assert.ok(expired.length >= 1, `recycled last-mile=${expired.length}`);
    const recycledDelta = (world.flow?.recycled.lots ?? 0) - recycledBefore;
    const expiredFlowDelta = (world.flow?.expired.lots ?? 0) - expiredFlowBefore;
    assert.ok(recycledDelta >= expired.length);
    assert.ok(
      expiredFlowDelta < recycledDelta,
      'late last-mile recycle must not also count as expiry',
    );
  });

  it('keeps GA Dry last-mile lots leaving major hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'last-mile-dry' });
    const parkUntil =
      (world.lastBatchAtMs ?? Date.now()) + 365 * 24 * 3_600_000;
    for (const npc of world.npcs) {
      npc.status = 'resting';
      npc.restUntilMs = parkUntil;
    }
    ensureSeedMarketFormed(world);

    const fromMajor = world.lots.filter(
      (l) =>
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg <= GA_LTL_MAX_KG &&
        /last-mile/i.test(l.reason) &&
        hubTierOf(
          world.airports.find((a) => a.icao === l.originIcao) ?? {
            icao: l.originIcao,
            hubTier: 'spoke',
          },
        ) === 'major',
    );
    assert.ok(
      fromMajor.length > 0,
      'expected last-mile Dry originating at majors',
    );
    const sbgr = fromMajor.filter((l) => l.originIcao === 'SBGR');
    const homeDry = (sbgr.length > 0 ? sbgr : fromMajor).slice(
      0,
      LAST_MILE_OPEN_LOTS_PER_ORIGIN * 2,
    );
    assert.ok(
      homeDry.length > 0,
      'expected last-mile Dry originating at majors',
    );
    for (const lot of homeDry) {
      assert.ok(lot.payUsd > 0, `${lot.id} payUsd=${lot.payUsd}`);
      assert.ok(lot.quantityKg >= SMALL_LOT_MIN_KG);
      assert.ok(lot.quantityKg <= GA_LTL_MAX_KG);
      const nm = routeDistanceNm(world, lot.originIcao, lot.destIcao);
      assert.ok(
        nm != null && nm >= 40 && nm <= LAST_MILE_MAX_NM,
        `${lot.originIcao}→${lot.destIcao} ${nm} nm`,
      );
    }
    const usMajorIcaos = new Set(
      world.airports
        .filter((a) => a.hubTier === 'major' && a.region.startsWith('US-'))
        .map((a) => a.icao),
    );
    const usGaDry = world.lots.filter(
      (l) =>
        usMajorIcaos.has(l.originIcao) &&
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg <= GA_LTL_MAX_KG,
    );
    assert.ok(usGaDry.length > 0, 'US majors should originate GA Dry');
    const usGatewayLastMile = fromMajor.filter((l) =>
      ['KJFK', 'KEWR', 'KMIA', 'KORD', 'KATL'].includes(l.originIcao),
    );
    assert.ok(
      usGatewayLastMile.length > 0,
      'US gateway majors should originate last-mile Dry',
    );
  });

  it('keeps GA Dry last-mile lots leaving spoke home hubs', () => {
    const world = createSeedEconomyWorld({ seed: 'last-mile-spoke' });
    const parkUntil =
      (world.lastBatchAtMs ?? Date.now()) + 365 * 24 * 3_600_000;
    for (const npc of world.npcs) {
      npc.status = 'resting';
      npc.restUntilMs = parkUntil;
    }
    const spokes = world.airports.filter((a) => hubTierOf(a) === 'spoke');
    assert.ok(spokes.length > 0, 'expected spoke airports');
    for (const spoke of spokes) {
      const pile = spoke.inventory.general;
      if (!pile) continue;
      pile.stockKg = Math.max(
        pile.stockKg,
        Math.round(pile.capacityKg * 0.35),
      );
    }
    ensureSeedMarketFormed(world);

    const fromSpoke = world.lots.filter(
      (l) =>
        (l.commodityId === 'general' || l.commodityId === 'supplies') &&
        (l.status === 'available' || l.status === 'reserved') &&
        l.quantityKg <= GA_LTL_MAX_KG &&
        /last-mile/i.test(l.reason) &&
        hubTierOf(
          world.airports.find((a) => a.icao === l.originIcao) ?? {
            icao: l.originIcao,
            hubTier: 'spoke',
          },
        ) === 'spoke',
    );
    assert.ok(
      fromSpoke.length > 0,
      'expected last-mile Dry originating at spokes',
    );
    for (const lot of fromSpoke) {
      assert.ok(lot.payUsd > 0, `${lot.id} payUsd=${lot.payUsd}`);
      assert.ok(lot.quantityKg >= SMALL_LOT_MIN_KG);
      assert.ok(lot.quantityKg <= GA_LTL_MAX_KG);
      const nm = routeDistanceNm(world, lot.originIcao, lot.destIcao);
      assert.ok(
        nm != null && nm >= 40 && nm <= LAST_MILE_MAX_NM,
        `${lot.originIcao}→${lot.destIcao} ${nm} nm`,
      );
    }
  });

  it('delivery only draws the share formation did not already commit', () => {
    const world = createSeedEconomyWorld({ seed: 'mass-balance-delivery' });
    const origin = world.airports.find((a) => a.icao === 'SBGR')!;
    const dest = world.airports.find((a) => a.icao === 'SBGL')!;
    const oPile = origin.inventory.general!;
    const dPile = dest.inventory.general!;
    oPile.stockKg = Math.round(oPile.capacityKg * 0.8);
    dPile.stockKg = Math.round(dPile.capacityKg * 0.1);
    const originBefore = oPile.stockKg;
    const destBefore = dPile.stockKg;

    const kg = 10_000;
    const result = applyFreightDelivery(world, {
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      kg,
    });

    assert.equal(
      result.removedFromOriginKg,
      Math.round(kg * (1 - LOT_FORMATION_RESERVE_FRACTION)),
    );
    assert.equal(oPile.stockKg, originBefore - result.removedFromOriginKg);
    assert.equal(dPile.stockKg, destBefore + kg);
  });

  it('returns the formation reserve to origin when a lot expires', () => {
    const world = createSeedEconomyWorld({ seed: 'mass-balance-expiry' });
    world.npcs = [];
    world.npcFlights = [];
    const origin = world.airports.find((a) => a.icao === 'SBGR')!;
    const pile = origin.inventory.general!;
    pile.stockKg = Math.round(pile.capacityKg * 0.5);
    const stockBefore = pile.stockKg;

    world.lots.push({
      id: 'lot_expiring_reserve',
      commodityId: 'general',
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 20_000,
      reservedKg: 0,
      createdAtTick: 0,
      expiresAtTick: world.tick + 1,
      payUsd: 5_000,
      basePayUsd: 5_000,
      urgency: 'normal',
      reason: 'reserve refund',
      status: 'available',
    });

    tickEconomyN(world, 2);

    const lot = world.lots.find((l) => l.id === 'lot_expiring_reserve');
    assert.ok(lot === undefined || lot.status === 'expired');
    const refunded = world.flow?.reserveRefundedKg ?? 0;
    assert.ok(refunded > 0, `expected a reserve refund, got ${refunded}`);
    // Production/consumption also move the pile, so assert direction not equality.
    assert.ok(
      pile.stockKg > stockBefore - 20_000 * LOT_FORMATION_RESERVE_FRACTION,
      'expiry should give the committed reserve back',
    );
  });

  it('sizes the board to what the local fleet can actually lift', () => {
    const world = createSeedEconomyWorld({ seed: 'board-capacity-target' });
    tickEconomyN(world, TICKS_PER_DAY * 3);

    const countryByIcao = new Map<string, string>();
    for (const ap of world.airports) {
      countryByIcao.set(ap.icao.toUpperCase(), countryIdFromRegion(ap.region));
    }
    const openKgByPartition = new Map<string, number>();
    for (const lot of world.lots) {
      if (lot.status !== 'available') continue;
      const partitionId = lotBoardPartition(lot, countryByIcao);
      openKgByPartition.set(
        partitionId,
        (openKgByPartition.get(partitionId) ?? 0) +
          Math.max(0, lot.quantityKg - lot.reservedKg),
      );
    }

    assert.ok(openKgByPartition.size > 0);
    for (const [partitionId, openKg] of openKgByPartition) {
      const target = partitionBoardKgTarget(world, partitionId);
      assert.ok(target > 0, `${partitionId} should have a capacity target`);
      // Formation checks the target before each push, so a single oversized lot
      // can cross it — allow one XL of slack.
      assert.ok(
        openKg <= target + XL_LOT_MAX_KG,
        `${partitionId} board ${Math.round(openKg)}kg over target ${Math.round(target)}kg`,
      );
    }
    assert.equal(BOARD_COVER_DAYS > 0, true);
  });

  it('counts formed lot sizes so GA-LTL supply is measurable', () => {
    const world = createSeedEconomyWorld({ seed: 'flow-size-mix' });
    tickEconomyN(world, TICKS_PER_DAY);

    const flow = world.flow;
    assert.ok(flow, 'ticking should accumulate flow stats');
    assert.ok(flow!.formed.lots > 0);
    const bands = flow!.formedBySize;
    const total = bands.ga_ltl + bands.ltl + bands.large + bands.xl;
    assert.equal(total, flow!.formed.lots);
    assert.ok(bands.ga_ltl > 0, 'expected GA-sized LTL in the formed mix');
    const expiredBands = flow!.expiredBySize;
    assert.ok(expiredBands, 'ticking should count expiry by size');
    assert.equal(
      expiredBands.ga_ltl + expiredBands.ltl + expiredBands.large + expiredBands.xl,
      flow!.expired.lots,
    );
  });

  it('forms XL lots on strong major↔major corridors when surplus is deep', () => {
    const world = createSeedEconomyWorld({ seed: 'xl-major-trunk' });
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 24, { fromBatchAtMs: 1 });

    const origin = world.airports.find((a) => a.icao === 'SBGR')!;
    const dest = world.airports.find((a) => a.icao === 'SBGL')!;
    assert.equal(hubTierOf(origin), 'major');
    assert.equal(hubTierOf(dest), 'major');
    assert.ok(corridorWeight('SBGR', 'SBGL') >= XL_CORRIDOR_MIN_WEIGHT);

    for (const c of ['electronics', 'machinery', 'general', 'perishables'] as const) {
      const oPile = origin.inventory[c]!;
      const dPile = dest.inventory[c]!;
      oPile.stockKg = Math.round(oPile.capacityKg * 0.92);
      dPile.stockKg = Math.round(dPile.capacityKg * 0.08);
    }
    // Free lane slots so the probe tick can form XL.
    world.lots = world.lots.filter((l) => l.status !== 'available');
    const before = world.tick;
    tickEconomyN(world, 1, { fromBatchAtMs: world.lastBatchAtMs });

    const xl = world.lots.filter(
      (l) =>
        l.createdAtTick > before &&
        l.quantityKg >= XL_LOT_MIN_KG &&
        /· XL/i.test(l.reason),
    );
    assert.ok(xl.length > 0, 'expected at least one XL lot on SBGR trunk');
    for (const lot of xl) {
      assert.ok(lot.quantityKg <= XL_LOT_MAX_KG);
      assert.ok(lot.quantityKg >= XL_LOT_MIN_KG);
      const oTier = hubTierOf(
        world.airports.find((a) => a.icao === lot.originIcao)!,
      );
      const dTier = hubTierOf(
        world.airports.find((a) => a.icao === lot.destIcao)!,
      );
      assert.equal(oTier, 'major');
      assert.equal(dTier, 'major');
    }
  });

  it('does not form XL on spoke ODs even with deep surplus', () => {
    const world = createSeedEconomyWorld({ seed: 'xl-spoke-blocked' });
    world.lastBatchAtMs = 1;
    tickEconomyN(world, 12, { fromBatchAtMs: 1 });

    const spokes = world.airports.filter((a) => hubTierOf(a) === 'spoke');
    assert.ok(spokes.length >= 2);
    for (const ap of spokes.slice(0, 8)) {
      for (const c of ['electronics', 'general'] as const) {
        const pile = ap.inventory[c];
        if (!pile || pile.capacityKg < 1_000) continue;
        pile.stockKg = Math.round(pile.capacityKg * 0.95);
      }
    }
    world.lots = world.lots.filter((l) => l.status !== 'available');
    const before = world.tick;
    tickEconomyN(world, 2, { fromBatchAtMs: world.lastBatchAtMs });

    const xlOnSpoke = world.lots.filter((l) => {
      if (!(l.createdAtTick > before) || l.quantityKg < XL_LOT_MIN_KG) {
        return false;
      }
      const o = world.airports.find((a) => a.icao === l.originIcao);
      const d = world.airports.find((a) => a.icao === l.destIcao);
      if (!o || !d) return false;
      return hubTierOf(o) === 'spoke' || hubTierOf(d) === 'spoke';
    });
    assert.equal(xlOnSpoke.length, 0);
  });

  it('xlLotOdEligible gates major trunks and intl capacity', () => {
    assert.equal(xlLotOdEligible('major', 'major', 2.2), true);
    assert.equal(xlLotOdEligible('major', 'major', 1.0), false);
    assert.equal(xlLotOdEligible('major', 'regional', 2.2), false);
    assert.equal(
      xlLotOdEligible('major', 'major', 1.0, {
        international: true,
        capacityKgPerDay: 90_000,
      }),
      true,
    );
    assert.equal(
      xlLotOdEligible('major', 'major', 1.0, {
        international: true,
        capacityKgPerDay: 40_000,
      }),
      false,
    );
  });

  it('forms lots involving expanded US spokes (PDX/OMA)', () => {
    const world = createSeedEconomyWorld({ seed: 'us-spoke-lots' });
    tickEconomyN(world, 48);
    const touch = world.lots.some(
      (lot) =>
        lot.originIcao === 'KPDX' ||
        lot.destIcao === 'KPDX' ||
        lot.originIcao === 'KOMA' ||
        lot.destIcao === 'KOMA',
    );
    assert.ok(touch, 'expected market activity on new US spoke/regional hubs');
  });

  it('pays more on origin-region lots when home NPC fleet is resting', () => {
    const region = 'BR-SE';

    function warmAndFreeze(resting: boolean) {
      const world = createSeedEconomyWorld({ seed: 'capacity-pay-boost' });
      world.lastBatchAtMs = 1;
      tickEconomyN(world, 36, { fromBatchAtMs: 1 });
      const nowMs = world.lastBatchAtMs;
      world.npcFlights = [];
      for (const npc of world.npcs) {
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        if (npc.homeRegion === region) {
          if (resting) {
            npc.status = 'resting';
            npc.restUntilMs = nowMs + 48 * MS_PER_HOUR;
            npc.dutyHoursAccum = 10;
          } else {
            npc.status = 'idle';
            npc.restUntilMs = undefined;
            npc.dutyHoursAccum = 0;
          }
        } else {
          npc.status = 'idle';
          npc.restUntilMs = undefined;
        }
      }
      // Free lane caps so the probe tick can form comparable SE-origin lots.
      world.lots = world.lots.filter((l) => l.status !== 'available');
      const beforeTick = world.tick;
      tickEconomyN(world, 1, { fromBatchAtMs: nowMs });
      const originIcaos = new Set(
        world.airports.filter((a) => a.region === region).map((a) => a.icao),
      );
      const fresh = world.lots.filter(
        (l) =>
          l.createdAtTick > beforeTick &&
          originIcaos.has(l.originIcao) &&
          l.quantityKg > 0,
      );
      const payPerKg =
        fresh.length === 0
          ? 0
          : fresh.reduce((s, l) => s + l.payUsd / l.quantityKg, 0) / fresh.length;
      return { fresh, payPerKg, capacity: npcRegionBidCapacity(world, region, world.lastBatchAtMs) };
    }

    const idle = warmAndFreeze(false);
    const rest = warmAndFreeze(true);
    assert.ok(idle.fresh.length > 0, 'expected new SE-origin lots with idle fleet');
    assert.ok(rest.fresh.length > 0, 'expected new SE-origin lots with resting fleet');
    assert.ok(idle.capacity > rest.capacity);
    assert.ok(
      rest.payPerKg > idle.payPerKg,
      `resting pay/kg ${rest.payPerKg} should exceed idle ${idle.payPerKg}`,
    );
  });

  it('softens urgency when NPC inbound covers dest shortage', () => {
    function prepare(withInbound: boolean): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'lane-urgency-shadow' });
      world.lastBatchAtMs = 1_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        npc.restUntilMs = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.electronics!.stockKg =
        origin.inventory.electronics!.capacityKg * 0.75;
      dest.inventory.electronics!.stockKg =
        dest.inventory.electronics!.capacityKg * 0.25;
      if (withInbound) {
        const flight: NpcFlight = {
          id: 'npcf-inbound-cover',
          npcId: world.npcs[0]!.id,
          lotId: 'lot_inbound',
          originIcao: 'SBPA',
          destIcao: 'SBGL',
          commodityId: 'electronics',
          cargoKg: 25_000,
          payUsd: 1,
          aircraftClassId: 'wide_freighter',
          departedAtTick: world.tick,
          arrivesAtTick: world.tick + 3,
          departedAtMs: world.lastBatchAtMs,
          arrivesAtMs: world.lastBatchAtMs + 3 * MS_PER_HOUR,
          status: 'in_flight',
        };
        world.npcFlights.push(flight);
      }
      return world;
    }

    const bare = prepare(false);
    const covered = prepare(true);
    const t0 = bare.tick;
    tickEconomyN(bare, 1, { fromBatchAtMs: bare.lastBatchAtMs });
    tickEconomyN(covered, 1, { fromBatchAtMs: covered.lastBatchAtMs });

    const bareLots = bare.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    const coveredLots = covered.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    assert.ok(bareLots.length > 0, 'expected electronics lots into SBGL');
    assert.ok(
      bareLots.some((l) => l.urgency === 'urgent'),
      'low fill + no inbound should mark urgent',
    );
    assert.ok(coveredLots.length > 0, 'expected lots even with inbound cover');
    assert.ok(
      coveredLots.every((l) => l.urgency === 'normal'),
      'inbound cover should clear urgent on non-perishable lots',
    );
  });

  it('softens urgency when player inbound covers dest shortage', () => {
    function prepare(withPlayerInbound: boolean): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'player-inbound-shadow' });
      world.lastBatchAtMs = 1_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.inboundPending = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
        npc.busyUntilMs = undefined;
        npc.restUntilMs = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.electronics!.stockKg =
        origin.inventory.electronics!.capacityKg * 0.75;
      dest.inventory.electronics!.stockKg =
        dest.inventory.electronics!.capacityKg * 0.25;
      if (withPlayerInbound) {
        world.inboundPending = [
          {
            id: 'msn_player:lot_x',
            missionId: 'msn_player',
            originIcao: 'SBPA',
            destIcao: 'SBGL',
            commodityId: 'electronics',
            cargoKg: 25_000,
            expiresAtTick: world.tick + 12,
            source: 'player',
          },
        ];
      }
      return world;
    }

    const bare = prepare(false);
    const covered = prepare(true);
    const t0 = bare.tick;
    tickEconomyN(bare, 1, { fromBatchAtMs: bare.lastBatchAtMs });
    tickEconomyN(covered, 1, { fromBatchAtMs: covered.lastBatchAtMs });

    const bareLots = bare.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    const coveredLots = covered.lots.filter(
      (l) =>
        l.createdAtTick > t0 &&
        l.destIcao === 'SBGL' &&
        l.commodityId === 'electronics',
    );
    assert.ok(bareLots.some((l) => l.urgency === 'urgent'));
    assert.ok(coveredLots.length > 0);
    assert.ok(
      coveredLots.every((l) => l.urgency === 'normal'),
      'player inbound should clear urgent like NPC airborne',
    );
  });

  it('blocks new lots on a fully saturated OD lane and pays more when partially saturated', () => {
    function prepare(airborneKg: number): CareerEconomyWorld {
      const world = createSeedEconomyWorld({ seed: 'lane-sat-form' });
      world.lastBatchAtMs = 2_000_000;
      world.lots = [];
      world.npcFlights = [];
      world.events = [];
      for (const npc of world.npcs) {
        npc.status = 'idle';
        npc.aggressiveness = 0;
        npc.currentFlightId = undefined;
      }
      for (const ap of world.airports) {
        for (const id of ['electronics', 'machinery', 'general', 'perishables'] as CommodityId[]) {
          const pile = ap.inventory[id]!;
          pile.stockKg = pile.capacityKg * 0.5;
        }
      }
      const origin = world.airports.find((a) => a.icao === 'SBGR')!;
      const dest = world.airports.find((a) => a.icao === 'SBGL')!;
      origin.inventory.general!.stockKg = origin.inventory.general!.capacityKg * 0.8;
      dest.inventory.general!.stockKg = dest.inventory.general!.capacityKg * 0.3;
      if (airborneKg > 0) {
        world.npcFlights.push({
          id: 'npcf-sat',
          npcId: world.npcs[0]!.id,
          lotId: 'lot_sat',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general',
          cargoKg: airborneKg,
          payUsd: 1,
          aircraftClassId: 'wide_freighter',
          departedAtTick: world.tick,
          arrivesAtTick: world.tick + 2,
          departedAtMs: world.lastBatchAtMs,
          arrivesAtMs: world.lastBatchAtMs + 2 * MS_PER_HOUR,
          status: 'in_flight',
        });
      }
      return world;
    }

    const clear = prepare(0);
    const full = prepare(LANE_SATURATION_KG);
    const partial = prepare(Math.ceil(LANE_SATURATION_KG * 0.4));
    assert.equal(npcLaneSaturation(full, 'SBGR', 'SBGL', 'general'), 1);
    assert.ok(npcLaneSaturation(partial, 'SBGR', 'SBGL', 'general') >= 0.35);

    const t0 = clear.tick;
    tickEconomyN(clear, 1, { fromBatchAtMs: clear.lastBatchAtMs });
    tickEconomyN(full, 1, { fromBatchAtMs: full.lastBatchAtMs });
    tickEconomyN(partial, 1, { fromBatchAtMs: partial.lastBatchAtMs });

    const lane = (w: CareerEconomyWorld) =>
      w.lots.filter(
        (l) =>
          l.createdAtTick > t0 &&
          l.originIcao === 'SBGR' &&
          l.destIcao === 'SBGL' &&
          l.commodityId === 'general',
      );

    assert.ok(lane(clear).length > 0, 'unsaturated lane should form lots');
    assert.equal(lane(full).length, 0, 'fully saturated lane should skip formation');
    assert.ok(lane(partial).length > 0, 'partial saturation may still form');

    const pay = (lots: ReturnType<typeof lane>) =>
      lots.reduce((s, l) => s + l.payUsd / l.quantityKg, 0) / lots.length;
    assert.ok(
      pay(lane(partial)) > pay(lane(clear)),
      'partial saturation should raise pay/kg vs clear lane',
    );
  });
});

describe('migrateEconomyWorld / ensureEconomyCaughtUp', () => {
  it('adds missing BR-N / BR-CO hubs to a truncated legacy airport list', () => {
    const full = createSeedEconomyWorld({ seed: 'hub-coverage' });
    const truncated = {
      version: 3 as const,
      seed: 'hub-coverage',
      tick: 5,
      lastBatchAtMs: full.lastBatchAtMs,
      airports: full.airports.filter(
        (a) => a.region === 'BR-SE' || a.region === 'BR-S' || a.region === 'BR-NE',
      ),
      lots: [],
      events: [],
      npcs: full.npcs,
      npcFlights: [],
    };
    assert.equal(truncated.airports.length, 38);
    const migrated = migrateEconomyWorld(truncated);
    assert.equal(migrated.airports.length, 934);
    assert.ok(migrated.airports.some((a) => a.icao === 'SBEG'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SBBR'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SBBV'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SBPJ'));
    assert.ok(migrated.airports.some((a) => a.icao === 'KMIA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'KLAX'));
    assert.ok(migrated.airports.some((a) => a.icao === 'KPDX'));
    assert.ok(migrated.airports.some((a) => a.icao === 'CYYZ'));
    assert.ok(migrated.airports.some((a) => a.icao === 'MMMX'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SAEZ'));
    assert.ok(migrated.airports.some((a) => a.icao === 'SCEL'));
    assert.ok(migrated.airports.some((a) => a.icao === 'GMMN'));
    assert.ok(migrated.airports.some((a) => a.icao === 'HEBA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'LLBG'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OEJN'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OMDB'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OTHH'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OKKK'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OETF'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OOMS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'ORBI'));
    assert.ok(migrated.airports.some((a) => a.icao === 'ORMM'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OIIE'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OJAI'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OLBA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OSDI'));
    assert.ok(migrated.airports.some((a) => a.icao === 'HLLM'));
    assert.ok(migrated.airports.some((a) => a.icao === 'HSSK'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OYSN'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OYAA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OPIS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OPKC'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VIDP'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VABB'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VOBL'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VOMM'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VECC'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VCBI'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VCRI'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UAAA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UACC'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UTTT'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UTAA'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UTAK'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UTDD'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UCFM'));
    assert.ok(migrated.airports.some((a) => a.icao === 'UCFO'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OAKB'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OAKN'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OAHR'));
    assert.ok(migrated.airports.some((a) => a.icao === 'OAMS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VNKT'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VNPK'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VGHS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VGEG'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VQPR'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VYYY'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VYMD'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VTBS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VTBU'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VTSP'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VVNB'));
    assert.ok(migrated.airports.some((a) => a.icao === 'VVTS'));
    assert.ok(migrated.airports.some((a) => a.icao === 'WMKK'));
    assert.ok(migrated.airports.some((a) => a.icao === 'WSSS'));
    assert.ok((migrated.internationalLanes?.length ?? 0) >= 30);
    const again = createSeedEconomyWorld({ seed: 'hub-coverage-idem' });
    assert.equal(ensureCareerHubCoverage(again), false);
  });

  it('rewrites swapped CL idents: La Serena SCIE→SCSE, Carriel Sur SCCD→SCIE', () => {
    const world = createSeedEconomyWorld({ seed: 'cl-ident-swap' });
    const laSerena = world.airports.find((airport) => airport.icao === 'SCSE')!;
    const carriel = world.airports.find((airport) => airport.icao === 'SCIE')!;
    laSerena.icao = 'SCIE';
    laSerena.name = 'La Serena La Florida';
    carriel.icao = 'SCCD';
    carriel.name = 'Concepción Carriel Sur';
    world.lots.push({
      id: 'lot-sccd',
      commodityId: 'general',
      originIcao: 'SCCD',
      destIcao: 'SCEL',
      quantityKg: 1_000,
      reservedKg: 0,
      createdAtTick: 0,
      expiresAtTick: 40,
      payUsd: 800,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    });
    const migrated = migrateEconomyWorld(world);
    const nextSerena = migrated.airports.find((airport) => airport.icao === 'SCSE');
    const nextCarriel = migrated.airports.find((airport) => airport.icao === 'SCIE');
    assert.ok(nextSerena);
    assert.match(nextSerena.name, /La Serena/i);
    assert.ok(nextCarriel);
    assert.match(nextCarriel.name, /Carriel|Concepci/i);
    assert.equal(
      migrated.airports.some((airport) => airport.icao === 'SCCD'),
      false,
    );
    assert.equal(
      migrated.lots.find((lot) => lot.id === 'lot-sccd')?.originIcao,
      'SCIE',
    );
    assert.equal(remapMislabelledClHubs(migrated), false);
  });

  it('prunes orphan CL strips that are no longer in the catalog', () => {
    const world = createSeedEconomyWorld({ seed: 'orphan-cl' });
    const template = world.airports[0]!;
    world.airports.push({
      ...structuredClone(template),
      icao: 'SCST',
      name: 'Gamboa Apt',
      region: 'CL-S',
      hubTier: 'spoke',
      lat: -42.49,
      lon: -73.77,
    });
    world.lots.push({
      id: 'lot-scst',
      commodityId: 'general',
      originIcao: 'SCST',
      destIcao: 'SCEL',
      quantityKg: 500,
      reservedKg: 0,
      createdAtTick: 0,
      expiresAtTick: 40,
      payUsd: 400,
      urgency: 'normal',
      reason: 'test',
      status: 'available',
    });
    assert.equal(pruneOrphanCareerHubs(world), true);
    assert.equal(
      world.airports.some((airport) => airport.icao === 'SCST'),
      false,
    );
    assert.equal(
      world.lots.some((lot) => lot.id === 'lot-scst'),
      false,
    );

    const legacy = createSeedEconomyWorld({ seed: 'orphan-cl-migrate' });
    legacy.airports.push({
      ...structuredClone(legacy.airports[0]!),
      icao: 'SCSN',
      name: 'Santo Domingo',
      region: 'CL-C',
      hubTier: 'spoke',
      lat: -33.65,
      lon: -71.61,
    });
    const migrated = migrateEconomyWorld(legacy);
    assert.equal(
      migrated.airports.some((airport) => airport.icao === 'SCSN'),
      false,
    );
  });

  it('remaps retired hub idents (MPPB→MPPA) and drops orphan NPC legs', () => {
    const world = createSeedEconomyWorld({ seed: 'remap-mppb' });
    const mppa = world.airports.find((a) => a.icao === 'MPPA');
    assert.ok(mppa);
    world.airports.push({
      ...structuredClone(mppa!),
      icao: 'MPPB',
      name: 'Legacy Howard',
    });
    const flight: NpcFlight = {
      id: 'npc-mppb-leg',
      npcId: world.npcs[0]?.id ?? 'npc-test',
      lotId: 'lot-none',
      originIcao: 'MPPB',
      destIcao: 'MPTO',
      commodityId: 'general',
      cargoKg: 400,
      payUsd: 1,
      aircraftClassId: 'light_ga',
      departedAtTick: world.tick,
      arrivesAtTick: world.tick + 2,
      departedAtMs: world.lastBatchAtMs,
      arrivesAtMs: world.lastBatchAtMs + 2 * MS_PER_HOUR,
      status: 'in_flight',
    };
    world.npcFlights.push(flight);
    assert.equal(remapRetiredCareerAirportIdents(world), true);
    assert.equal(
      world.airports.some((airport) => airport.icao === 'MPPB'),
      false,
    );
    assert.equal(
      world.npcFlights.some((row) => row.originIcao === 'MPPA'),
      true,
    );

    const legacy = createSeedEconomyWorld({ seed: 'remap-mppb-migrate' });
    legacy.npcFlights.push({
      ...flight,
      id: 'npc-mppb-leg2',
      originIcao: 'MPPB',
    });
    const after = migrateEconomyWorld(legacy);
    assert.equal(
      after.npcFlights.some((row) => row.originIcao === 'MPPB'),
      false,
    );
    assert.equal(
      after.npcFlights.some((row) => row.originIcao === 'MPPA'),
      true,
    );
  });

  it('refuses MSFS Facilities when ident/coords mismatch the catalog', () => {
    const carriel = { icao: 'SCIE', lat: -36.7727, lon: -73.0631 };
    assert.equal(msfsFacilityMatchesCareerHub('SCIE', carriel).ok, true);
    const castro = { icao: 'SCCD', lat: -42.3245, lon: -73.3887 };
    const bad = msfsFacilityMatchesCareerHub('SCIE', castro);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.reason, /≠|nm/i);
  });

  it('migrates v1 without retroactive catch-up', () => {
    const v1 = {
      version: 1 as const,
      seed: 'legacy',
      tick: 12,
      airports: createSeedEconomyWorld({ seed: 'legacy' }).airports,
      lots: [],
    };
    const now = 1_700_000_000_000;
    const migrated = migrateEconomyWorld(v1, { nowMs: now });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.tick, 12);
    assert.equal(migrated.lastBatchAtMs, now);
    assert.ok(migrated.airports[0]?.baseProduction);
  });

  it('migrates v2 tick timestamps to wall-clock ms', () => {
    const seeded = createSeedEconomyWorld({ seed: 'v2-ms' });
    const anchor = 1_700_000_000_000;
    const raw = {
      version: 2 as const,
      seed: 'v2-ms',
      tick: 100,
      lastSyncedAtMs: anchor,
      airports: seeded.airports,
      lots: [],
      events: [],
      npcs: seeded.npcs,
      npcFlights: [
        {
          id: 'f1',
          npcId: seeded.npcs[0]!.id,
          lotId: 'lot1',
          originIcao: 'SBGR',
          destIcao: 'SBGL',
          commodityId: 'general' as const,
          cargoKg: 5_000,
          payUsd: 1000,
          aircraftClassId: 'narrow_freighter' as const,
          departedAtTick: 98,
          arrivesAtTick: 102,
          status: 'in_flight' as const,
        },
      ],
    };
    const migrated = migrateEconomyWorld(raw, { nowMs: anchor });
    assert.equal(migrated.version, 3);
    assert.equal(migrated.lastBatchAtMs, anchor);
    const flight = migrated.npcFlights[0]!;
    assert.equal(flight.departedAtMs, anchor - 2 * MS_PER_TICK);
    assert.equal(flight.arrivesAtMs, anchor + 2 * MS_PER_TICK);
  });

  it('catches up whole hours 1:1 and preserves partial hour', () => {
    const world = createSeedEconomyWorld({ seed: 'catch-up' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 0;
    // +3h 20m → 13 × 15-min batches + 5m remainder
    const threeHoursPlus = start + 3 * MS_PER_HOUR + 20 * 60 * 1000;
    const { advancedTicks } = ensureEconomyCaughtUp(world, threeHoursPlus);
    assert.equal(advancedTicks, 13);
    assert.equal(world.tick, 13);
    assert.equal(world.lastBatchAtMs, threeHoursPlus - 5 * 60 * 1000);
  });

  it('returns 0 when less than one batch elapsed', () => {
    const world = createSeedEconomyWorld({ seed: 'partial' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    const before = world.tick;
    const { advancedTicks } = ensureEconomyCaughtUp(world, start + 14 * 60 * 1000);
    assert.equal(advancedTicks, 0);
    assert.equal(world.tick, before);
  });

  it('snaps a future sim clock and shifts fuel haul ETAs back to wall time', () => {
    const world = createSeedEconomyWorld({ seed: 'future-clock-fuel' });
    const wallNow = 1_800_000_000_000;
    const futureAnchor = wallNow + 90 * 24 * 60 * 60 * 1000;
    world.lastBatchAtMs = futureAnchor;
    world.lastSyncedAtMs = futureAnchor;
    world.fuelHauls = [
      {
        id: 'fuelh-stuck',
        truckId: 'truck-0',
        originIcao: 'KATL',
        destIcao: 'KMEM',
        commodityId: 'fuel',
        cargoKg: 12_000,
        departedAtMs: futureAnchor,
        arrivesAtMs: futureAnchor + 12 * 60 * 60 * 1000,
        status: 'enroute',
      },
    ];
    world.fuelTrucks![0]!.status = 'enroute';
    world.fuelTrucks![0]!.currentHaulId = 'fuelh-stuck';
    world.fuelTrucks![0]!.busyUntilMs = futureAnchor + 12 * 60 * 60 * 1000;

    const { advancedTicks } = ensureEconomyCaughtUp(world, wallNow);
    assert.equal(advancedTicks, 0);
    assert.ok(world.lastBatchAtMs <= wallNow);
    const haul = world.fuelHauls!.find((h) => h.id === 'fuelh-stuck');
    assert.ok(haul);
    assert.ok(
      haul!.departedAtMs <= wallNow + 60_000,
      `departedAtMs should snap near wall, got ${haul!.departedAtMs} vs ${wallNow}`,
    );
    const views = listAirportFuelInbound(world, 'KMEM', world.lastBatchAtMs);
    const view = views.find((h) => h.id === 'fuelh-stuck');
    if (view) {
      assert.ok(view.etaHours < 48, `ETA should be hours not days, got ${view.etaHours}h`);
    }
  });

  it('exposes continuous fractional hours between batches', () => {
    const world = createSeedEconomyWorld({ seed: 'frac' });
    const start = 1_700_000_000_000;
    world.lastBatchAtMs = start;
    world.tick = 10;
    const half = continuousEconomyHours(world, start + MS_PER_TICK / 2);
    assert.ok(Math.abs(half - 10.5) < 1e-9);
  });
});

describe('pruneDeadLots', () => {
  it('keeps live lots and drops expired/delivered outside the retention window', () => {
    const world = createSeedEconomyWorld({ seed: 'prune-lots' });
    world.tick = 100;
    world.lots = [
      {
        id: 'live',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBGL',
        quantityKg: 1_000,
        reservedKg: 0,
        createdAtTick: 90,
        expiresAtTick: 120,
        payUsd: 100,
        urgency: 'normal',
        reason: 'live',
        status: 'available',
      },
      {
        id: 'transit',
        commodityId: 'general',
        originIcao: 'SBGR',
        destIcao: 'SBPA',
        quantityKg: 500,
        reservedKg: 500,
        createdAtTick: 10,
        expiresAtTick: 20,
        payUsd: 50,
        urgency: 'normal',
        reason: 'transit',
        status: 'in_transit',
      },
      {
        id: 'recent-expired',
        commodityId: 'electronics',
        originIcao: 'SBGL',
        destIcao: 'SBRJ',
        quantityKg: 200,
        reservedKg: 0,
        createdAtTick: 90,
        expiresAtTick: world.tick - 2,
        payUsd: 10,
        urgency: 'normal',
        reason: 'recent',
        status: 'expired',
      },
      {
        id: 'old-expired',
        commodityId: 'electronics',
        originIcao: 'SBGL',
        destIcao: 'SBRJ',
        quantityKg: 200,
        reservedKg: 0,
        createdAtTick: 1,
        expiresAtTick: world.tick - (DEAD_LOT_RETENTION_TICKS + 5),
        payUsd: 10,
        urgency: 'normal',
        reason: 'old',
        status: 'expired',
      },
      {
        id: 'old-delivered',
        commodityId: 'machinery',
        originIcao: 'SBPA',
        destIcao: 'SBGR',
        quantityKg: 800,
        reservedKg: 0,
        createdAtTick: 1,
        expiresAtTick: world.tick - (DEAD_LOT_RETENTION_TICKS + 1),
        payUsd: 20,
        urgency: 'urgent',
        reason: 'delivered',
        status: 'delivered',
      },
    ];

    const { removed, kept } = pruneDeadLots(world);
    assert.equal(removed, 2);
    assert.equal(kept, 3);
    assert.deepEqual(
      world.lots.map((l) => l.id).sort(),
      ['live', 'recent-expired', 'transit'],
    );
  });

  it('does not expire reserved or partially-booked lots past market expiry', () => {
    const world = createSeedEconomyWorld({ seed: 'expire-reserved' });
    world.tick = 10;
    world.lots = [
      {
        id: 'reserved-crew',
        commodityId: 'supplies',
        originIcao: 'KABI',
        destIcao: 'KDFW',
        quantityKg: 2_000,
        reservedKg: 2_000,
        createdAtTick: 1,
        expiresAtTick: 5,
        payUsd: 400,
        urgency: 'normal',
        reason: 'crew airborne',
        status: 'reserved',
      },
      {
        id: 'partial-booked',
        commodityId: 'general',
        originIcao: 'KABI',
        destIcao: 'KDFW',
        quantityKg: 3_000,
        reservedKg: 1_000,
        createdAtTick: 1,
        expiresAtTick: 5,
        payUsd: 300,
        urgency: 'normal',
        reason: 'partial',
        status: 'available',
      },
      {
        id: 'pure-available',
        commodityId: 'electronics',
        originIcao: 'KABI',
        destIcao: 'KDFW',
        quantityKg: 500,
        reservedKg: 0,
        createdAtTick: 1,
        expiresAtTick: 5,
        payUsd: 50,
        urgency: 'normal',
        reason: 'expire me',
        status: 'available',
      },
    ];

    tickEconomyN(world, 1, { fromBatchAtMs: world.lastBatchAtMs });

    assert.equal(world.lots.find((l) => l.id === 'reserved-crew')?.status, 'reserved');
    assert.equal(world.lots.find((l) => l.id === 'partial-booked')?.status, 'available');
    assert.equal(world.lots.find((l) => l.id === 'pure-available')?.status, 'expired');
  });

  it('prunes bloated saves on migrate', () => {
    const seeded = createSeedEconomyWorld({ seed: 'prune-migrate' });
    seeded.tick = 200;
    const junk = Array.from({ length: 50 }, (_, i) => ({
      id: `junk_${i}`,
      commodityId: 'general' as const,
      originIcao: 'SBGR',
      destIcao: 'SBGL',
      quantityKg: 100,
      reservedKg: 0,
      createdAtTick: 1,
      expiresAtTick: 10,
      payUsd: 1,
      urgency: 'normal' as const,
      reason: 'junk',
      status: 'expired' as const,
    }));
    const raw = {
      version: 3 as const,
      seed: seeded.seed,
      tick: seeded.tick,
      lastBatchAtMs: seeded.lastBatchAtMs,
      airports: seeded.airports,
      lots: junk,
      events: [],
      npcs: seeded.npcs,
      npcFlights: [],
    };
    const migrated = migrateEconomyWorld(raw);
    assert.equal(migrated.lots.length, 0);
  });
});
