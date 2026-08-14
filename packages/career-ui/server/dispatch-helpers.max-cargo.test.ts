import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  clearClassMaxCargoKgCache,
  resolveClassMaxCargoKg,
} from './dispatch-helpers.ts';

afterEach(() => {
  clearClassMaxCargoKgCache();
});

describe('resolveClassMaxCargoKg', () => {
  it('prefers live SimBrief structural over a complete catalog row (BN2)', async () => {
    const limit = await resolveClassMaxCargoKg(
      'light_ga',
      'blackbox-bn2-islander-cargo-tip-tanks',
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              BN2P: {
                airframes: [
                  {
                    airframe_internal_id: 'bn2p_default',
                    airframe_list_type: 'BN2P',
                    airframe_icao: 'BN2P',
                    airframe_comments: 'Default',
                    airframe_name: 'BN-2 Islander',
                    airframe_passengers: 9,
                    airframe_options: {
                      wgtunits: 'LBS',
                      maxcargo: 400,
                      oew: 4114,
                      mzfw: 6300,
                      mtow: 6600,
                      maxfuel: 390,
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
      },
    );
    assert.equal(limit.source, 'mzfw-oew');
    assert.equal(limit.maxCargoKg, Math.round(2186 / 2.2046226218));
  });

  it('falls back to airframe catalog when SimBrief is unreachable', async () => {
    const limit = await resolveClassMaxCargoKg(
      'light_ga',
      'blackbox-bn2-islander-cargo-tip-tanks',
      {
        fetchImpl: async () => {
          throw new Error('network down');
        },
      },
    );
    assert.equal(limit.source, 'airframe-catalog');
    assert.equal(limit.maxCargoKg, 991);
  });

  it('falls back to class when SimBrief fails and catalog has no maxCargoKg', async () => {
    const limit = await resolveClassMaxCargoKg('light_ga', undefined, {
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    assert.equal(limit.source, 'class-fallback');
    assert.equal(limit.maxCargoKg, 450);
  });
});
