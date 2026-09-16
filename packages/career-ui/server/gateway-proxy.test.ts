import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gatewayResponseHeaders } from './gateway-proxy.js';

describe('gatewayResponseHeaders', () => {
  it('drops encoding and stale length after fetch decodes the body', () => {
    const headers = gatewayResponseHeaders(
      new Headers({
        'content-type': 'application/json',
        'content-encoding': 'gzip',
        'content-length': '123',
        'x-world-header': 'kept',
      }),
    );

    assert.equal(headers['content-type'], 'application/json');
    assert.equal(headers['x-world-header'], 'kept');
    assert.equal(headers['content-encoding'], undefined);
    assert.equal(headers['content-length'], undefined);
    assert.equal(headers['access-control-allow-origin'], '*');
  });
});
