/**
 * Sample live cruise fuel burn for an already-registered Career airframe
 * and write kg/h + kg/nm into career-player-airframes.json.
 */
import {
  confirm,
  printKv,
  printSection,
  withPrompts,
  type AskFn,
} from './prompt.js';
import {
  listCareerPlayerAirframeCatalog,
  updateCareerPlayerAirframeBurn,
} from './career-player-airframe-catalog.js';
import { deriveFuelBurnKgPerNm } from './parse-aircraft-cfg-ui.js';
import type { NamedPipeSimBridge } from './named-pipe-sim-bridge.js';
import {
  probeLiveFuelFlowSimVars,
  readLiveCruiseTasKt,
  sampleLiveCruiseFuelFlowKgPerHour,
} from './sample-cruise-burn.js';
import { titleSearchTokens, scorePathAgainstTokens } from './find-flight-model.js';

type CatalogRow = Awaited<
  ReturnType<typeof listCareerPlayerAirframeCatalog>
>[number];

function rankRowsForTitle(rows: CatalogRow[], liveTitle: string): CatalogRow[] {
  const tokens = titleSearchTokens(liveTitle);
  return [...rows]
    .map((row) => ({
      row,
      score:
        scorePathAgainstTokens(row.label, tokens) +
        scorePathAgainstTokens(row.typeId, tokens) +
        scorePathAgainstTokens(row.simbriefIcao, tokens),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.row.label.localeCompare(b.row.label),
    )
    .map((item) => item.row);
}

function printRows(rows: CatalogRow[]): void {
  for (const [i, row] of rows.entries()) {
    const burn =
      row.cruiseFuelFlowKgPerHour != null
        ? `${row.cruiseFuelFlowKgPerHour} kg/h`
        : row.fuelBurnKgPerNm != null
          ? `${row.fuelBurnKgPerNm} kg/nm`
          : '—';
    console.log(
      `  ${String(i + 1).padStart(2)}. ${row.label}  (${row.typeId} · ${row.aircraftClassId} · burn ${burn})`,
    );
  }
}

async function pickRow(
  ask: AskFn,
  rows: CatalogRow[],
  defaultIndex = 1,
): Promise<CatalogRow | null> {
  if (rows.length === 0) {
    console.log('  No registered Career airframes — run homologate first.');
    return null;
  }
  printRows(rows);
  const raw = (
    await ask('Catalog airframe (number or typeId)', String(defaultIndex))
  ).trim();
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= rows.length) {
    return rows[asNum - 1]!;
  }
  const byId = rows.find((row) => row.typeId === raw);
  if (byId) return byId;
  console.log('  Invalid choice.');
  return null;
}

export async function runSampleBurnWizard(opts: {
  bridge: NamedPipeSimBridge;
  repoRoot: string;
  /** Optional typeId skip-pick (CLI --type). */
  typeId?: string;
}): Promise<void> {
  await withPrompts(async (ask) => {
    printSection('Sample cruise burn');
    console.log(
      '  Reads live ENG FUEL FLOW in stable cruise and updates career-player-airframes.json.',
    );
    console.log('  Spawn the homologated aircraft first; engines must be producing flow.');

    const identity = await opts.bridge.getAircraftIdentity();
    const liveTitle =
      identity.title?.trim() ||
      identity.atcModel?.trim() ||
      '(unknown title)';
    printKv([
      [
        'bridge',
        `simconnect connected=${(await opts.bridge.status()).connected}`,
      ],
      ['title (live)', liveTitle],
      ['atcModel', identity.atcModel],
      ['icao', identity.icao],
    ]);

    const allRows = await listCareerPlayerAirframeCatalog(opts.repoRoot);
    const ranked = rankRowsForTitle(allRows, liveTitle);

    let row: CatalogRow | null = null;
    if (opts.typeId?.trim()) {
      row =
        allRows.find((r) => r.typeId === opts.typeId!.trim()) ?? null;
      if (!row) {
        console.log(`  Unknown typeId: ${opts.typeId}`);
        return;
      }
      printKv([
        ['selected', `${row.label} (${row.typeId})`],
        [
          'current burn',
          row.cruiseFuelFlowKgPerHour != null
            ? `${row.cruiseFuelFlowKgPerHour} kg/h` +
              (row.fuelBurnKgPerNm != null
                ? ` · ${row.fuelBurnKgPerNm} kg/nm`
                : '')
            : row.fuelBurnKgPerNm != null
              ? `${row.fuelBurnKgPerNm} kg/nm`
              : '—',
        ],
      ]);
    } else {
      console.log('');
      console.log('  Registered airframes (best title match first):');
      row = await pickRow(ask, ranked, 1);
      if (!row) return;
    }

    printKv([
      ['typeId', row.typeId],
      ['label', row.label],
      ['class', row.aircraftClassId],
      [
        'catalog burn now',
        [
          row.cruiseFuelFlowKgPerHour != null
            ? `${row.cruiseFuelFlowKgPerHour} kg/h`
            : null,
          row.fuelBurnKgPerNm != null ? `${row.fuelBurnKgPerNm} kg/nm` : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
      ],
    ]);

    if (
      !(await confirm(
        ask,
        'Aircraft in stable cruise with engines producing fuel flow — sample now',
        true,
      ))
    ) {
      console.log('  Aborted — no catalog changes.');
      return;
    }

    const liveKgPerHour = await sampleLiveCruiseFuelFlowKgPerHour(opts.bridge);
    if (liveKgPerHour == null) {
      console.log(
        '  No usable fuel-flow SimVar (tried ENG/RECIP/TURB FUEL FLOW PPH + GPH).',
      );
      console.log('  Probe (nonzero / errors help diagnose):');
      const probe = await probeLiveFuelFlowSimVars(opts.bridge);
      for (const row of probe) {
        if (row.value == null && !row.error) continue;
        if (row.value === 0 && !row.error) continue;
        const detail =
          row.value != null
            ? String(Math.round(row.value * 1000) / 1000)
            : `err ${row.error}`;
        console.log(`    ${row.simVar} (${row.unit}) = ${detail}`);
      }
      console.log(
        '  Tip: engines running + mixture/throttle producing flow; Avgas twin often uses RECIP ENG FUEL FLOW.',
      );
      console.log('  Nothing written.');
      return;
    }

    const liveTas = await readLiveCruiseTasKt(opts.bridge);
    const tasRaw = await ask(
      'Cruise TAS for kg/nm (kt)',
      liveTas != null ? String(liveTas) : '',
    );
    const cruiseSpeedKt = Number(tasRaw);
    if (!Number.isFinite(cruiseSpeedKt) || cruiseSpeedKt <= 0) {
      console.log('  Need a positive cruise TAS. Nothing written.');
      return;
    }

    const fuelBurnKgPerNm = deriveFuelBurnKgPerNm(liveKgPerHour, cruiseSpeedKt);
    if (fuelBurnKgPerNm == null) {
      console.log('  Could not derive kg/nm. Nothing written.');
      return;
    }

    printSection('Sample result');
    printKv([
      ['live burn', `${liveKgPerHour} kg/h`],
      ['cruise TAS', `${cruiseSpeedKt} kt`],
      ['derived', `${fuelBurnKgPerNm} kg/nm`],
      [
        'was',
        [
          row.cruiseFuelFlowKgPerHour != null
            ? `${row.cruiseFuelFlowKgPerHour} kg/h`
            : null,
          row.fuelBurnKgPerNm != null ? `${row.fuelBurnKgPerNm} kg/nm` : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
      ],
    ]);

    if (!(await confirm(ask, `Write burn to catalog for ${row.typeId}`, true))) {
      console.log('  Skipped write.');
      return;
    }

    const updated = await updateCareerPlayerAirframeBurn({
      repoRoot: opts.repoRoot,
      typeId: row.typeId,
      cruiseFuelFlowKgPerHour: liveKgPerHour,
      fuelBurnKgPerNm,
      cruiseSpeedKt,
    });

    printSection('Catalog updated');
    printKv([
      ['typeId', updated.typeId],
      ['cruise burn', `${updated.cruiseFuelFlowKgPerHour} kg/h`],
      ['cruise TAS', `${updated.cruiseSpeedKt ?? cruiseSpeedKt} kt`],
      ['burn / nm', `${updated.fuelBurnKgPerNm} kg/nm`],
      [
        'file',
        'packages/shared/src/data/career-player-airframes.json (+ dist copy)',
      ],
    ]);
    console.log(
      '  Restart Career UI / rebuild shared if the hangar still shows the old burn.',
    );
  });
}
