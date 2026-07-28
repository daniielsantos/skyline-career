import type {
  FingerprintRequest,
  FingerprintResponse,
  ProfileDocumentEnvelope,
  ProfileManifest,
  ProfileResolveResponse,
} from '@msfs-compat/shared';

export interface CatalogClientOptions {
  baseUrl?: string;
}

export class CatalogClient {
  readonly baseUrl: string;

  constructor(options: CatalogClientOptions = {}) {
    const raw =
      options.baseUrl ??
      process.env.MSFS_COMPAT_CATALOG_URL ??
      'http://localhost:8080/v1';
    this.baseUrl = raw.replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`catalog ${method} ${path} → ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }

  async registerFingerprint(request: FingerprintRequest): Promise<FingerprintResponse> {
    return this.request<FingerprintResponse>('POST', '/aircraft/fingerprint', request);
  }

  async resolveProfile(params: {
    fingerprint: string;
    simVersion: string;
    channel?: string;
    clientId?: string;
  }): Promise<ProfileResolveResponse> {
    const qs = new URLSearchParams({
      fingerprint: params.fingerprint,
      simVersion: params.simVersion,
      channel: params.channel ?? 'stable',
    });
    if (params.clientId) qs.set('clientId', params.clientId);
    return this.request<ProfileResolveResponse>('GET', `/profiles/resolve?${qs}`);
  }

  async getManifest(channel = 'stable'): Promise<ProfileManifest> {
    const qs = new URLSearchParams({ channel });
    return this.request<ProfileManifest>('GET', `/profiles/manifest?${qs}`);
  }

  async getDocument(profileKey: string, semver: string): Promise<ProfileDocumentEnvelope> {
    const qs = new URLSearchParams({ semver });
    return this.request<ProfileDocumentEnvelope>(
      'GET',
      `/profiles/${encodeURIComponent(profileKey)}/document?${qs}`,
    );
  }

  async health(): Promise<boolean> {
    try {
      const root = this.baseUrl.replace(/\/v1$/, '');
      const response = await fetch(`${root}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
