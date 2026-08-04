import { normalizeMacPercent } from '@msfs-compat/shared';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface FlightModelCgData {
  path?: string;
  minMac?: number;
  maxMac?: number;
  emptyWeightCgPosition?: [number, number, number];
  stationArms: Record<number, number>;
  /**
   * First station_load field when > 0 (often default or max weight in lb).
   * Many freighter cfgs leave cargo at 0 — treat as unknown, not zero capacity.
   */
  stationMaxLoads: Record<number, number>;
  /** Optional payload UI name from station_load / station_name. */
  stationNames: Record<number, string>;
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
  const stationMaxLoads: Record<number, number> = {};
  const stationNames: Record<number, string> = {};

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

    const nameKey = /^station_name\.(\d+)$/.exec(key);
    if (nameKey) {
      const index = Number(nameKey[1]) + 1;
      const label = valueWithoutComment(value).replace(/^"|"$/g, '').trim();
      if (label) stationNames[index] = shortenStationName(label);
      continue;
    }

    const station = /^station_load\.(\d+)$/.exec(key);
    if (station) {
      const index = Number(station[1]) + 1;
      const fields = valueWithoutComment(value).split(',');
      const weight = Number(fields[0]?.trim());
      const longitudinalArm = Number(fields[1]?.trim());
      if (Number.isFinite(longitudinalArm)) {
        stationArms[index] = longitudinalArm;
      }
      // First field > 0 may be default or max; 0 means unknown (common on empty cargo).
      if (Number.isFinite(weight) && weight > 0) {
        stationMaxLoads[index] = Math.round(weight);
      }
      if (!stationNames[index]) {
        const nameField = fields
          .slice(4)
          .map((f) => f.trim())
          .find((f) => f.length > 0 && !/^\d+(\.\d+)?$/.test(f));
        if (nameField) {
          stationNames[index] = shortenStationName(
            nameField.replace(/^"|"$/g, ''),
          );
        }
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
    stationMaxLoads,
    stationNames,
  };
}

function shortenStationName(raw: string): string {
  const tt = /TT:MENU\.PAYLOAD\.(.+)$/i.exec(raw);
  if (tt?.[1]) {
    return tt[1]
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
}

export async function readFlightModelCg(path: string): Promise<FlightModelCgData> {
  const absolutePath = resolve(path);
  return parseFlightModelCg(await readFile(absolutePath, 'utf8'), absolutePath);
}
