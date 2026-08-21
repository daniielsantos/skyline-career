import type {
  AircraftProfile,
  FuelTarget,
  GatingRules,
  LoadPlanRequest,
  OperationResult,
  PayloadTarget,
} from '@msfs-compat/shared';

export interface SimVarReadRequest {
  name: string;
  unit: string;
}

export interface SimVarWriteRequest {
  name: string;
  unit: string;
  value: number;
}

export interface LVarWriteRequest {
  name: string;
  value: number;
}

export interface EventTriggerRequest {
  event: string;
  data?: number;
}

export interface SimSnapshot {
  onGround: boolean;
  enginesRunning: boolean;
  parkingBrake: boolean;
  paused: boolean;
  slewActive: boolean;
  simRate: number;
  cgPercent?: number;
  grossWeightLb?: number;
  fuelTotal?: number;
  payloadTotal?: number;
  vars: Record<string, number>;
}

export interface SimBridge {
  readSimVar(request: SimVarReadRequest): Promise<number>;
  /**
   * Optional: one SimConnect request for many FLOAT64 vars (Host max 32).
   * NamedPipeSimBridge implements this; mocks may omit it.
   */
  readSimVars?(requests: SimVarReadRequest[]): Promise<number[]>;
  writeSimVar(request: SimVarWriteRequest): Promise<void>;
  readLVar(name: string): Promise<number>;
  writeLVar(request: LVarWriteRequest): Promise<void>;
  triggerHVar(name: string): Promise<void>;
  triggerEvent(request: EventTriggerRequest): Promise<void>;
  snapshot(): Promise<SimSnapshot>;
  delay(ms: number): Promise<void>;
  /**
   * Optional: PMDG NG3 CDU key via control area / mapped event.
   * Required when profile fuel/payload strategy is `pmdg-cdu`.
   */
  sendPmdgNg3Control?(opts: {
    eventId?: number;
    key?: string;
    parameter?: number;
    release?: boolean;
    method?: 'event' | 'control';
    cdu?: 'left' | 'right';
    /** Keep key pressed before release/clear (ms). CLR long-press uses ~3000. */
    holdMs?: number;
  }): Promise<{
    ok: boolean;
    eventId: number;
    parameter: number;
    release?: boolean;
    method?: string;
    cdu?: string;
    holdMs?: number | null;
  }>;
}

export interface StrategyContext {
  profile: AircraftProfile;
  bridge: SimBridge;
  snapshot: SimSnapshot;
  /**
   * Multi-step inject/rebalance: skip writePlan `delay` ops and post-write
   * settle IPC so the pipe stays free for station writes.
   */
  skipSettle?: boolean;
  /** Pause after each non-delay writePlan step (see LoadPlanRequest.writeGapMs). */
  writeGapMs?: number;
  /** Tank ids whose writePlan steps should be skipped (idle AUX/TIP). */
  omitFuelTankWrites?: string[];
}

export interface CapabilityScore {
  strategy: string;
  score: number;
  reasons: string[];
}

export interface CapabilityDetector {
  detect(profile: AircraftProfile, bridge: SimBridge): Promise<CapabilityScore[]>;
}

export interface VerificationResult {
  ok: boolean;
  failures: Array<{
    var: string;
    expected: number;
    actual: number;
    tolerancePct: number;
  }>;
}

export interface FuelStrategy {
  readonly name: string;
  canHandle(profile: AircraftProfile): boolean;
  detect(ctx: StrategyContext): Promise<CapabilityScore>;
  setFuel(target: FuelTarget, ctx: StrategyContext): Promise<OperationResult>;
  verify(target: FuelTarget, ctx: StrategyContext): Promise<VerificationResult>;
}

export interface PayloadStrategy {
  readonly name: string;
  canHandle(profile: AircraftProfile): boolean;
  detect(ctx: StrategyContext): Promise<CapabilityScore>;
  setPayload(target: PayloadTarget, ctx: StrategyContext): Promise<OperationResult>;
  verify(target: PayloadTarget, ctx: StrategyContext): Promise<VerificationResult>;
}

export interface ProfileEngine {
  applyLoadPlan(request: LoadPlanRequest): Promise<{
    fuel?: OperationResult;
    payload?: OperationResult;
    cg?: VerificationResult;
  }>;
}

export interface GatingEvaluator {
  evaluate(rules: GatingRules, snapshot: SimSnapshot): { allowed: boolean; reason?: string };
}
