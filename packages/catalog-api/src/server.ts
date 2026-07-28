import Fastify from 'fastify';
import type {
  FingerprintRequest,
  HomologationSessionStartRequest,
  OperationTelemetryBatch,
} from '@msfs-compat/shared';
import { CatalogStore } from './store.js';

export interface CreateServerOptions {
  store: CatalogStore;
}

export async function createCatalogServer(options: CreateServerOptions) {
  const app = Fastify({ logger: true });
  const { store } = options;

  app.get('/health', async () => ({ ok: true, service: 'msfs-compat-catalog-api' }));

  app.post<{ Body: FingerprintRequest }>('/v1/aircraft/fingerprint', async (req, reply) => {
    const body = req.body;
    if (!body?.clientId || !body?.simVersion || !body?.identity || !body?.structure) {
      return reply.code(400).send({ error: 'invalid_request', message: 'Missing required fields' });
    }
    const result = store.registerFingerprint(body);
    return reply.code(result.known ? 200 : 202).send(result);
  });

  app.get<{
    Querystring: { fingerprint?: string; simVersion?: string; channel?: string; clientId?: string };
  }>('/v1/profiles/resolve', async (req, reply) => {
    const { fingerprint, simVersion, channel } = req.query;
    if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
      return reply.code(400).send({ error: 'invalid_request', message: 'fingerprint required (64 hex)' });
    }
    if (!simVersion) {
      return reply.code(400).send({ error: 'invalid_request', message: 'simVersion required' });
    }
    const resolved = store.resolveProfile(fingerprint, simVersion, channel ?? 'stable');
    if (!resolved) {
      return reply.code(404).send({ error: 'not_found', message: 'No profile for fingerprint' });
    }
    return resolved;
  });

  app.get<{ Querystring: { channel?: string; sinceVersion?: string } }>(
    '/v1/profiles/manifest',
    async (req) => store.getManifest(req.query.channel ?? 'stable'),
  );

  app.get<{
    Params: { profileKey: string };
    Querystring: { semver?: string };
  }>('/v1/profiles/:profileKey/document', async (req, reply) => {
    const semver = req.query.semver;
    if (!semver) {
      return reply.code(400).send({ error: 'invalid_request', message: 'semver required' });
    }
    const doc = store.getDocument(req.params.profileKey, semver);
    if (!doc) {
      return reply.code(404).send({ error: 'not_found', message: 'Profile document not found' });
    }
    return doc;
  });

  app.post<{ Body: HomologationSessionStartRequest }>('/v1/homologation/sessions', async (req, reply) => {
    const body = req.body;
    if (!body?.clientId || !body?.fingerprint || !body?.simVersion) {
      return reply.code(400).send({ error: 'invalid_request', message: 'Missing required fields' });
    }
    const session = await store.startHomologationSession(body);
    return reply.code(201).send(session);
  });

  app.post<{ Body: OperationTelemetryBatch }>('/v1/telemetry/operations', async (req, reply) => {
    const body = req.body;
    if (!body?.clientId || !Array.isArray(body.events)) {
      return reply.code(400).send({ error: 'invalid_request', message: 'Missing clientId/events' });
    }
    const ack = await store.ingestOperations(body);
    return reply.code(202).send(ack);
  });

  return app;
}
