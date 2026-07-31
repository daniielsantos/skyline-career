import { normalizeMacPercent } from '@msfs-compat/shared';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface FlightModelCgData {
  path?: string;
  minMac?: number;
  maxMac?: number;
  emptyWeightCgPosition?: [number, number, number];
  stationArms: Record<number, number>;
}

function valueWithoutComment(raw: string): string {
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') quoted = !quoted;
    if (raw[i] === ';' && !quoted) return raw.slice(0, i).trim();
  }
  return raw.trim();
}

function parseNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(valueWithoutComment(raw).split(',')[0]?.trim());
  return Number.isFinite(value) ? value : undefined;
}

function macPercent(raw: string | undefined): number | undefined {
  const value = parseNumber(raw);
  if (value === undefined) return undefined;
  return normalizeMacPercent(value);
}

function parseVector3(raw: string | undefined): [number, number, number] | undefined {
  if (!raw) return undefined;
  const values = valueWithoutComment(raw)
    .split(',')
    .slice(0, 3)
    .map((part) => Number(part.trim()));
  return values.length === 3 && values.every(Number.isFinite)
    ? (values as [number, number, number])
    : undefined;
}

export function parseFlightModelCg(
  text: string,
  path?: string,
): FlightModelCgData {
  let section = '';
  const values = new Map<string, string>();
  const stationArms: Record<number, number> = {};

  for (const sourceLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(';')) continue;
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim().toLowerCase();
      continue;
    }
    if (section !== 'weight_and_balance') continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim().toLowerCase();
    const value = line.slice(equals + 1).trim();
    values.set(key, value);

    const station = /^station_load\.(\d+)$/.exec(key);
    if (station) {
      const fields = valueWithoutComment(value).split(',');
      const longitudinalArm = Number(fields[1]?.trim());
      if (Number.isFinite(longitudinalArm)) {
        stationArms[Number(station[1]) + 1] = longitudinalArm;
      }
    }
  }

  const forward = macPercent(values.get('cg_forward_limit'));
  const aft = macPercent(values.get('cg_aft_limit'));
  return {
    path,
    minMac:
      forward !== undefined && aft !== undefined ? Math.min(forward, aft) : forward,
    maxMac:
      forward !== undefined && aft !== undefined ? Math.max(forward, aft) : aft,
    emptyWeightCgPosition: parseVector3(values.get('empty_weight_cg_position')),
    stationArms,
  };
}

export async function readFlightModelCg(path: string): Promise<FlightModelCgData> {
  const absolutePath = resolve(path);
  return parseFlightModelCg(await readFile(absolutePath, 'utf8'), absolutePath);
}
