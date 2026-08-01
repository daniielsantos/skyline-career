/**
 * Interactive list / disable / enable for Skyline Career Market airframes.
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
  setCareerPlayerAirframeEnabled,
} from './career-player-airframe-catalog.js';

type CatalogRow = Awaited<
  ReturnType<typeof listCareerPlayerAirframeCatalog>
>[number];

function isEnabled(row: CatalogRow): boolean {
  return row.enabled !== false;
}

function printCatalog(rows: CatalogRow[]): void {
  if (rows.length === 0) {
    console.log('  (no player airframes registered)');
    return;
  }
  for (const [i, row] of rows.entries()) {
    const flag = isEnabled(row) ? 'enabled ' : 'disabled';
    console.log(
      `  ${String(i + 1).padStart(2)}. [${flag}]  ${row.label}  (${row.typeId} · ${row.aircraftClassId})`,
    );
  }
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
  printCatalog(rows);
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

export async function runCareerAirframeWizard(opts: {
  repoRoot: string;
}): Promise<void> {
  await withPrompts(async (ask) => {
    printSection('Skyline Aircraft Market');
    console.log('  Toggle homologated models on/off the buy/lease board.');
    console.log('  Roles packs and owned fleet stay intact.');

    for (;;) {
      const rows = await listCareerPlayerAirframeCatalog(opts.repoRoot);
      console.log('');
      printCatalog(rows);
      console.log('');
      console.log('  Actions:');
      console.log('    1. Refresh list');
      console.log('    2. Disable a model (hide from Market)');
      console.log('    3. Enable a model (show on Market)');
      console.log('    4. Quit');

      const action = (await ask('Choice', '4')).trim().toLowerCase();
      if (!action || action === '4' || action === 'q' || action === 'quit') {
        break;
      }
      if (action === '1' || action === 'list' || action === 'refresh') {
        continue;
      }

      const enabling = action === '3' || action === 'enable' || action === 'e';
      const disabling = action === '2' || action === 'disable' || action === 'd';
      if (!enabling && !disabling) {
        console.log('  Unknown action.');
        continue;
      }

      const candidates = rows.filter((row) =>
        enabling ? !isEnabled(row) : isEnabled(row),
      );
      if (candidates.length === 0) {
        console.log(
          enabling
            ? '  All models are already enabled.'
            : '  All models are already disabled.',
        );
        continue;
      }

      const picked = await pickRow(
        ask,
        enabling ? 'Enable which model' : 'Disable which model',
        candidates,
      );
      if (!picked) continue;

      const ok = await confirm(
        ask,
        `${enabling ? 'Enable' : 'Disable'} "${picked.label}" (${picked.typeId}) on the Market`,
        true,
      );
      if (!ok) continue;

      const updated = await setCareerPlayerAirframeEnabled({
        repoRoot: opts.repoRoot,
        typeId: picked.typeId,
        enabled: enabling,
      });
      printKv([
        ['typeId', updated.typeId],
        ['label', updated.label],
        ['Market', updated.enabled === false ? 'disabled' : 'enabled'],
      ]);
      console.log(
        '  Restart career-ui / rebuild @msfs-compat/shared if the board does not refresh.',
      );
    }
  });
}
