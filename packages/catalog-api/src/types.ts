import type {
  FingerprintRequest,
  FingerprintResponse,
  HomologationSession,
  HomologationSessionStartRequest,
  OperationTelemetryBatch,
  ProfileDocumentEnvelope,
  ProfileManifest,
  ProfileResolveResponse,
  AircraftProfile,
} from '@msfs-compat/shared';

export interface CatalogEntry {
  fingerprint: string;
  structuralHash: string;
  profileKey: string;
  semver: string;
  status: 'active' | 'provisional';
  confidenceScore: number;
  capabilities: string[];
  documentHash: string;
  signature: string;
  sizeBytes: number;
  profilePath?: string;
  profile: AircraftProfile;
}

export interface CatalogBackend {
  init(): Promise<void>;
  getEntries(): Promise<CatalogEntry[]> | CatalogEntry[];
  registerFingerprint(request: FingerprintRequest): Promise<FingerprintResponse> | FingerprintResponse;
  resolveProfile(
    fingerprint: string,
    simVersion: string,
    channel?: string,
  ): Promise<ProfileResolveResponse | null> | ProfileResolveResponse | null;
  getManifest(channel?: string): Promise<ProfileManifest> | ProfileManifest;
  getDocument(
    profileKey: string,
    semver: string,
  ): Promise<ProfileDocumentEnvelope | null> | ProfileDocumentEnvelope | null;
  startHomologationSession(request: HomologationSessionStartRequest): Promise<HomologationSession>;
  ingestOperations(batch: OperationTelemetryBatch): Promise<{ accepted: number }>;
}
