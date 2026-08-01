import { resolve } from 'node:path';
import type { CareerMissionsState, MissionIntent } from '@msfs-compat/shared';
import {
  applyWalletDelta,
  emptyMissionsStateV2,
  openCareerStore,
  type CareerStore,
} from '@msfs-compat/shared';

export const DEFAULT_CAREER_MISSIONS_PATH = 'profiles/career/local-missions.json';

function careerDirFromMissionsPath(path: string): string {
  const abs = resolve(path);
  return abs.replace(/[\\/][^\\/]+$/, '');
}

async function storeForPath(path: string): Promise<CareerStore> {
  return openCareerStore({ careerDir: careerDirFromMissionsPath(path) });
}

export function emptyMissionsState(): CareerMissionsState {
  return emptyMissionsStateV2();
}

export async function loadCareerMissions(path: string): Promise<CareerMissionsState> {
  const store = await storeForPath(path);
  try {
    return await store.loadMissions();
  } finally {
    store.close();
  }
}

export async function saveCareerMissions(
  path: string,
  state: CareerMissionsState,
): Promise<void> {
  const store = await storeForPath(path);
  try {
    await store.saveMissions(state);
  } finally {
    store.close();
  }
}

export async function loadOrCreateCareerMissions(path: string): Promise<CareerMissionsState> {
  try {
    return await loadCareerMissions(path);
  } catch {
    const fresh = emptyMissionsState();
    await saveCareerMissions(path, fresh);
    return fresh;
  }
}

export function upsertMission(state: CareerMissionsState, mission: MissionIntent): void {
  const idx = state.missions.findIndex((m) => m.id === mission.id);
  if (idx >= 0) {
    state.missions[idx] = mission;
  } else {
    state.missions.push(mission);
  }
}

export function findMission(
  state: CareerMissionsState,
  missionId: string,
): MissionIntent | undefined {
  return state.missions.find((m) => m.id === missionId);
}

export function creditWallet(
  state: CareerMissionsState,
  amountUsd: number,
  opts: { atTick?: number; kind?: 'freight_payout' | 'other'; note?: string } = {},
): number {
  applyWalletDelta(state, {
    amountUsd,
    kind: opts.kind ?? 'other',
    atTick: opts.atTick ?? 0,
    note: opts.note,
  });
  return state.walletUsd;
}
