import type { AircraftStructure, FingerprintInput } from './aircraft-profile.js';

export interface FingerprintRequest {
  clientId: string;
  simVersion: string;
  identity: FingerprintInput['identity'];
  structure: AircraftStructure;
}

export interface FingerprintResponse {
  fingerprint: string;
  known: boolean;
  homologationRequired: boolean;
  profileStatus?: 'none' | 'provisional' | 'active' | 'blocked';
  activeProfileKey?: string;
  activeSemver?: string;
  confidenceScore?: number;
}

export interface ProfileResolveResponse {
  profileKey: string;
  semver: string;
  status: 'provisional' | 'active';
  confidenceScore?: number;
  documentUrl: string;
  documentHash: string;
  signature: string;
  capabilities?: string[];
}

export interface ProfileManifestEntry {
  fingerprint: string;
  profileKey: string;
  semver: string;
  documentHash: string;
  sizeBytes: number;
  deltaFromHash?: string;
}

export interface ProfileManifest {
  channel: string;
  manifestVersion: number;
  generatedAt: string;
  entries: ProfileManifestEntry[];
  signature: string;
}

export interface ProfileDocumentEnvelope {
  profile: Record<string, unknown>;
  documentHash: string;
  signature: string;
}

export interface IngestAck {
  accepted: number;
  rejected?: number;
}

export interface HomologationSessionStartRequest {
  clientId: string;
  fingerprint: string;
  simVersion: string;
  userId?: string;
}

export interface HomologationSession {
  sessionId: string;
  fingerprint: string;
  checklist: string[];
}

export interface HomologationTelemetryBatch {
  sessionId: string;
  fingerprint: string;
  clientId: string;
  samples: Array<{
    capturedAt: string;
    phase: string;
    simState: Record<string, unknown>;
    writeAttempts?: Record<string, unknown>[];
    readback?: Record<string, unknown>;
    flags?: string[];
  }>;
}

export interface OperationTelemetryEvent {
  operation: 'setFuel' | 'setPayload' | 'setFuelAndPayload' | 'verifyCg';
  success: boolean;
  timestamp: string;
  fingerprint?: string;
  profileKey?: string;
  profileSemver?: string;
  strategyUsed?: string;
  fallbackUsed?: boolean;
  durationMs?: number;
  errorCode?: string;
  context?: Record<string, unknown>;
}

export interface OperationTelemetryBatch {
  clientId: string;
  events: OperationTelemetryEvent[];
}
