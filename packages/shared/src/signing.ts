import { createHash, createHmac } from 'node:crypto';

export function sha256Hex(payload: string | Buffer): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Local/dev document signing (HMAC-SHA256). Not production PKI.
 */
export function signDocument(
  documentHash: string,
  signingKey: string = process.env.CATALOG_SIGNING_KEY ?? 'dev-local-key',
): string {
  return createHmac('sha256', signingKey).update(documentHash).digest('hex');
}

export function hashAndSignProfile(
  profile: unknown,
  signingKey?: string,
): { documentHash: string; signature: string; sizeBytes: number } {
  const body = canonicalJson(profile);
  const documentHash = sha256Hex(body);
  const signature = signDocument(documentHash, signingKey);
  return {
    documentHash,
    signature,
    sizeBytes: Buffer.byteLength(body, 'utf8'),
  };
}
