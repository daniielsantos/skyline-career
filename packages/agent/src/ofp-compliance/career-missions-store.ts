import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CareerMissionsState, MissionIntent } from '@msfs-compat/shared';

export const DEFAULT_CAREER_MISSIONS_PATH = 'profiles/career/local-missions.json';

export function emptyMissionsState(): CareerMissionsState {
  return { version: 1, walletUsd: 0, missions: [] };
}

function normalizeMissionsState(parsed: CareerMissionsState): CareerMissionsState {
  return {
    version: 1,
    walletUsd: typeof parsed.walletUsd === 'number' && Number.isFinite(parsed.walletUsd)
      ? parsed.walletUsd
      : 0,
    missions: Array.isArray(parsed.missions) ? parsed.missions : [],
  };
}

export async function loadCareerMissions(path: string): Promise<CareerMissionsState> {
  const raw = await readFile(resolve(path), 'utf8');
  const parsed = JSON.parse(raw) as CareerMissionsState;
  if (parsed.version !== 1 || !Array.isArray(parsed.missions)) {
    throw new Error(`Invalid career missions file: ${path}`);
  }
  return normalizeMissionsState(parsed);
}

export async function saveCareerMissions(
  path: string,
  state: CareerMissionsState,
): Promise<void> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  const normalized = normalizeMissionsState(state);
  await writeFile(abs, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
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

export function creditWallet(state: CareerMissionsState, amountUsd: number): number {
  state.walletUsd = Math.round((state.walletUsd + amountUsd) * 100) / 100;
  return state.walletUsd;
}
