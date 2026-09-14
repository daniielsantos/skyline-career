import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  careerWorldApiUrlFromEnv,
  isGatewayEnrichApiPath,
  isGatewayProxiedPath,
  isSimLocalApiPath,
  resolveCareerApiMode,
} from './career-api-mode.ts';

describe('career-api-mode', () => {
  it('resolveCareerApiMode defaults to full', () => {
    assert.equal(resolveCareerApiMode({}), 'full');
  });

  it('CAREER_DISABLE_SIM implies world', () => {
    assert.equal(resolveCareerApiMode({ CAREER_DISABLE_SIM: '1' }), 'world');
  });

  it('CAREER_WORLD_API_URL implies gateway', () => {
    assert.equal(
      resolveCareerApiMode({
        CAREER_WORLD_API_URL: 'http://127.0.0.1:8788',
      }),
      'gateway',
    );
  });

  it('explicit CAREER_API_MODE wins', () => {
    assert.equal(
      resolveCareerApiMode({
        CAREER_API_MODE: 'full',
        CAREER_DISABLE_SIM: '1',
        CAREER_WORLD_API_URL: 'http://x',
      }),
      'full',
    );
  });

  it('isSimLocalApiPath covers watch/inject/preflight', () => {
    assert.equal(isSimLocalApiPath('/api/watch/status'), true);
    assert.equal(isSimLocalApiPath('/api/load-ofp'), true);
    assert.equal(isSimLocalApiPath('/api/load-ofp/progress'), true);
    assert.equal(isSimLocalApiPath('/api/preflight'), true);
    assert.equal(isSimLocalApiPath('/api/simbridge/status'), true);
    assert.equal(isSimLocalApiPath('/api/settle'), false);
    assert.equal(isSimLocalApiPath('/api/market'), false);
  });

  it('isGatewayEnrichApiPath for settle/depart', () => {
    assert.equal(isGatewayEnrichApiPath('/api/settle'), true);
    assert.equal(isGatewayEnrichApiPath('/api/depart'), true);
    assert.equal(isGatewayEnrichApiPath('/api/watch/start'), false);
  });

  it('isGatewayProxiedPath keeps UI + sim local', () => {
    assert.equal(isGatewayProxiedPath('/'), false);
    assert.equal(isGatewayProxiedPath('/assets/index.js'), false);
    assert.equal(isGatewayProxiedPath('/api/health'), false);
    assert.equal(isGatewayProxiedPath('/api/watch/status'), false);
    assert.equal(isGatewayProxiedPath('/api/market'), true);
    assert.equal(isGatewayProxiedPath('/api/auth/login'), true);
    assert.equal(isGatewayProxiedPath('/worlds/w1/clock'), true);
  });

  it('careerWorldApiUrlFromEnv trims trailing slash', () => {
    assert.equal(
      careerWorldApiUrlFromEnv({
        CAREER_WORLD_API_URL: 'http://host:8787/',
      }),
      'http://host:8787',
    );
  });
});
