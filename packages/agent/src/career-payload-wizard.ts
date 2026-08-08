/**
 * Interactive wizard: align Career Market airframe payload weights with SimBrief.
 * Separate from `homologate` — run after the model is already on the board.
 */
import { clampCareerMaxCargoKg, KG_TO_LB } from '@msfs-compat/shared';
import {
  confirm,
  printKv,
  printSection,
  withPrompts,
  type AskFn,
} from './prompt.js';
import {
  listCareerPlayerAirframeCatalog,
  setCareerPlayerAirframePayloadWeights,
  type CareerPlayerAirframeCatalogRow,
} from './career-player-airframe-catalog.js';
import { resolveSimBriefMaxCargoKg } from './ofp-compliance/simbrief-airframes.js';

type CatalogRow = CareerPlayerAirframeCatalogRow;

function kgLb(kg: number | undefined): string {
  if (typeof kg !== 'number' || !Number.isFinite(kg) || kg <= 0) return '—';
  return `${Math.round(kg)} kg (${Math.round(kg * KG_TO_LB)} lb)`;
}

function structuralLeftoverKg(row: CatalogRow): number | undefined {
  if (
    typeof row.oewKg === 'number' &&
    typeof row.mtowKg === 'number' &&
    row.mtowKg > row.oewKg
  ) {
    return Math.floor(row.mtowKg - row.oewKg);
  }
  return undefined;
}

function printRowSummary(row: CatalogRow, index?: number): void {
  const prefix =
    index != null ? `  ${String(index + 1).padStart(2)}. ` : '  ';
  const leftover = structuralLeftoverKg(row);
  const over =
    leftover != null &&
    typeof row.maxCargoKg === 'number' &&
    row.maxCargoKg > leftover;
  console.log(
    `${prefix}${row.label}  (${row.typeId} · ${row.simbriefIcao}/${row.simbriefAirframeMatch})`,
  );
  console.log(
    `       OEW ${kgLb(row.oewKg)} · MTOW ${kgLb(row.mtowKg)} · cargo ${kgLb(row.maxCargoKg)}${
      over ? ` ⚠ > MTOW−OEW ${leftover}` : ''
    } · fuel ${kgLb(row.fuelCapacityKg)}`,
  );
}

async function pickRow(
  ask: AskFn,
  question: string,
  rows: CatalogRow[],
): Promise<CatalogRow | null> {
  if (rows.length === 0) {
    console.log('  Nothing to pick.');
    return null;
  }
  for (const [i, row] of rows.entries()) {
    printRowSummary(row, i);
  }
  const raw = (await ask(question, '1')).trim();
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= rows.length) {
    return rows[asNum - 1]!;
  }
  const byId = rows.find((row) => row.typeId === raw);
  if (byId) return byId;
  const byLabel = rows.find(
    (row) => row.label.toLowerCase() === raw.toLowerCase(),
  );
  if (byLabel) return byLabel;
  console.log('  Invalid choice.');
  return null;
}

async function askPositiveKg(
  ask: AskFn,
  label: string,
  fallback: number | undefined,
): Promise<number | undefined> {
  const def =
    typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0
      ? String(Math.round(fallback))
      : '';
  const raw = (await ask(`${label} — enter kg`, def)).trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) {
    console.log('  Invalid kg — keeping previous proposal.');
    return fallback;
  }
  return Math.round(n);
}

export type SimBriefPayloadProposal = {
  oewKg?: number;
  mtowKg?: number;
  fuelCapacityKg?: number;
  mzfwKg?: number;
  simbriefMaxCargoKg: number;
  simbriefSource: string;
  airframeLabel: string;
  /** Catalog cargo after min(station/catalog, SimBrief) + structural clamp. */
  proposedMaxCargoKg: number;
};

export function buildSimBriefPayloadProposal(
  row: CatalogRow,
  opts: {
    simbriefMaxCargoKg: number;
    simbriefSource: string;
    airframeLabel: string;
    oewKg?: number;
    mtowKg?: number;
    mzfwKg?: number;
    fuelCapacityKg?: number;
  },
): SimBriefPayloadProposal {
  const oewKg = opts.oewKg ?? row.oewKg;
  const mtowKg = opts.mtowKg ?? row.mtowKg;
  const fuelCapacityKg = opts.fuelCapacityKg ?? row.fuelCapacityKg;
  const candidates = [opts.simbriefMaxCargoKg];
  if (typeof row.maxCargoKg === 'number' && row.maxCargoKg > 0) {
    candidates.push(row.maxCargoKg);
  }
  const proposedMaxCargoKg =
    clampCareerMaxCargoKg({
      maxCargoKg: Math.min(...candidates),
      oewKg,
      mtowKg,
      mzfwKg: opts.mzfwKg,
    }) ?? Math.min(...candidates);

  return {
    oewKg,
    mtowKg,
    fuelCapacityKg,
    mzfwKg: opts.mzfwKg,
    simbriefMaxCargoKg: opts.simbriefMaxCargoKg,
    simbriefSource: opts.simbriefSource,
    airframeLabel: opts.airframeLabel,
    proposedMaxCargoKg,
  };
}

async function syncRowFromSimBrief(
  ask: AskFn,
  repoRoot: string,
  row: CatalogRow,
): Promise<boolean> {
  console.log('');
  printRowSummary(row);
  console.log('  Fetching SimBrief airframes.json…');
  let proposal: SimBriefPayloadProposal;
  try {
    const resolved = await resolveSimBriefMaxCargoKg({
      simbriefIcao: row.simbriefIcao,
      simbriefAirframeMatch: row.simbriefAirframeMatch,
    });
    proposal = buildSimBriefPayloadProposal(row, {
      simbriefMaxCargoKg: resolved.maxCargoKg,
      simbriefSource: resolved.source,
      airframeLabel: resolved.airframe.comments || resolved.airframe.name,
      oewKg: resolved.airframe.oewKg,
      mtowKg: resolved.airframe.mtowKg,
      mzfwKg: resolved.airframe.mzfwKg,
      fuelCapacityKg: resolved.airframe.fuelCapacityKg,
    });
  } catch (error) {
    console.log(
      `  SimBrief lookup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }

  printKv([
    ['SimBrief airframe', proposal.airframeLabel],
    ['SimBrief source', proposal.simbriefSource],
    ['SimBrief maxcargo', kgLb(proposal.simbriefMaxCargoKg)],
    ['SimBrief OEW/MTOW/fuel', `${kgLb(proposal.oewKg)} / ${kgLb(proposal.mtowKg)} / ${kgLb(proposal.fuelCapacityKg)} (reference only)`],
    ['Catalog OEW/MTOW/fuel', `${kgLb(row.oewKg)} / ${kgLb(row.mtowKg)} / ${kgLb(row.fuelCapacityKg)} (unchanged)`],
    ['Proposed cargo', kgLb(proposal.proposedMaxCargoKg)],
  ]);
  console.log(
    '  Only Career max cargo is written — OEW / MTOW / fuel stay as in the catalog.',
  );
  console.log(
    '  Tip: after a real OFP on a typical leg, you can type a tighter cargo kg.',
  );

  const cargoDefault = proposal.proposedMaxCargoKg;
  const cargoDefaultLb =
    typeof cargoDefault === 'number' && Number.isFinite(cargoDefault)
      ? Math.round(cargoDefault * KG_TO_LB)
      : undefined;
  const maxCargoKg = await askPositiveKg(
    ask,
    cargoDefaultLb != null
      ? `Career max cargo (${cargoDefault} kg / ${cargoDefaultLb} lb)`
      : 'Career max cargo',
    cargoDefault,
  );
  const finalCargo =
    clampCareerMaxCargoKg({
      maxCargoKg,
      oewKg: row.oewKg,
      mtowKg: row.mtowKg,
      mzfwKg: proposal.mzfwKg,
    }) ?? maxCargoKg;

  if (finalCargo == null) {
    console.log('  No cargo ceiling — cancelled.');
    return false;
  }

  printKv([
    ['Will write cargo', kgLb(finalCargo)],
    ['OEW / MTOW / fuel', 'unchanged'],
  ]);
  const ok = await confirm(
    ask,
    `Write max cargo for "${row.label}"`,
    true,
  );
  if (!ok) return false;

  const updated = await setCareerPlayerAirframePayloadWeights({
    repoRoot,
    typeId: row.typeId,
    maxCargoKg: finalCargo,
  });
  printKv([
    ['typeId', updated.typeId],
    ['cargo', kgLb(updated.maxCargoKg)],
    ['OEW', kgLb(updated.oewKg)],
    ['MTOW', kgLb(updated.mtowKg)],
    ['fuel', kgLb(updated.fuelCapacityKg)],
  ]);
  return true;
}

export async function runCareerPayloadWizard(opts: {
  repoRoot: string;
}): Promise<void> {
  await withPrompts(async (ask) => {
    printSection('Skyline Career · payload / SimBrief');
    console.log(
      '  Align Market maxcargo with SimBrief (OEW / MTOW / fuel stay as homologated).',
    );
    console.log(
      '  Does not re-homologate stations — only the Career cargo ceiling used by Freights.',
    );

    for (;;) {
      const rows = await listCareerPlayerAirframeCatalog(opts.repoRoot);
      console.log('');
      console.log('  Actions:');
      console.log('    1. List airframes (flag over-cap cargo)');
      console.log('    2. Sync one from SimBrief (review + optional override)');
      console.log('    3. Sync all from SimBrief (confirm each)');
      console.log('    4. Quit');

      const action = (await ask('Choice', '4')).trim().toLowerCase();
      if (!action || action === '4' || action === 'q' || action === 'quit') {
        break;
      }

      if (action === '1' || action === 'list' || action === 'l') {
        if (rows.length === 0) {
          console.log('  Catalog is empty — run homologate first.');
          continue;
        }
        for (const [i, row] of rows.entries()) {
          printRowSummary(row, i);
        }
        continue;
      }

      if (action === '2' || action === 'sync' || action === 's') {
        if (rows.length === 0) {
          console.log('  Catalog is empty — run homologate first.');
          continue;
        }
        const picked = await pickRow(ask, 'Sync which airframe', rows);
        if (!picked) continue;
        const wrote = await syncRowFromSimBrief(ask, opts.repoRoot, picked);
        if (wrote) {
          console.log(
            '  Rebuild @msfs-compat/shared + restart career-ui to refresh Freights caps.',
          );
        }
        continue;
      }

      if (action === '3' || action === 'all' || action === 'a') {
        if (rows.length === 0) {
          console.log('  Catalog is empty — run homologate first.');
          continue;
        }
        let wroteAny = false;
        for (const row of rows) {
          const go = await confirm(
            ask,
            `Review SimBrief payload for "${row.label}"`,
            true,
          );
          if (!go) continue;
          const wrote = await syncRowFromSimBrief(ask, opts.repoRoot, row);
          wroteAny = wroteAny || wrote;
        }
        if (wroteAny) {
          console.log(
            '  Rebuild @msfs-compat/shared + restart career-ui to refresh Freights caps.',
          );
        }
        continue;
      }

      console.log('  Unknown action.');
    }
  });
}
