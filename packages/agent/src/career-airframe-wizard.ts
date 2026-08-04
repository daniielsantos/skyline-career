/**
 * Interactive list / disable / enable / remove for Skyline Career Market airframes.
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
  removeCareerPlayerAirframeFamily,
  setCareerPlayerAirframeEnabled,
} from './career-player-airframe-catalog.js';

type CatalogRow = Awaited<
  ReturnType<typeof listCareerPlayerAirframeCatalog>
>[number];

function isEnabled(row: CatalogRow): boolean {
  return row.enabled !== false;
}

function familyPackCount(row: CatalogRow): number {
  const packs = new Set([
    row.rolesPackRelPath,
    ...(row.familyRolesPackRelPaths ?? []),
  ]);
  return packs.size;
}

function printCatalog(rows: CatalogRow[]): void {
  if (rows.length === 0) {
    console.log('  (no player airframes registered)');
    return;
  }
  for (const [i, row] of rows.entries()) {
    const flag = isEnabled(row) ? 'enabled ' : 'disabled';
    const family =
      familyPackCount(row) > 1 ? ` · family×${familyPackCount(row)}` : '';
    console.log(
      `  ${String(i + 1).padStart(2)}. [${flag}]  ${row.label}  (${row.typeId} · ${row.aircraftClassId}${family})`,
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
    console.log('  Or remove a Market family for a clean re-homologation.');

    for (;;) {
      const rows = await listCareerPlayerAirframeCatalog(opts.repoRoot);
      console.log('');
      printCatalog(rows);
      console.log('');
      console.log('  Actions:');
      console.log('    1. Refresh list');
      console.log('    2. Disable a model (hide from Market)');
      console.log('    3. Enable a model (show on Market)');
      console.log('    4. Remove family (catalog + packs + profiles)');
      console.log('    5. Quit');

      const action = (await ask('Choice', '5')).trim().toLowerCase();
      if (!action || action === '5' || action === 'q' || action === 'quit') {
        break;
      }
      if (action === '1' || action === 'list' || action === 'refresh') {
        continue;
      }

      if (
        action === '4' ||
        action === 'remove' ||
        action === 'delete' ||
        action === 'r'
      ) {
        if (rows.length === 0) {
          console.log('  Catalog is empty.');
          continue;
        }
        const picked = await pickRow(
          ask,
          'Remove which Market family',
          rows,
        );
        if (!picked) continue;

        const packs = [
          ...new Set([
            picked.rolesPackRelPath,
            ...(picked.familyRolesPackRelPaths ?? []),
          ]),
        ];
        console.log('');
        console.log(
          `  Will remove Market SKU "${picked.label}" (${picked.typeId})`,
        );
        console.log('  and homologation files for:');
        for (const rel of packs) {
          console.log(`    - ${rel}`);
        }
        console.log(
          '  Also deletes related examples/drafts/notes (sibling variants by pack titles) and cache.',
        );
        console.log(
          '  Hangar aircraft of this type stay until you sell them in-game.',
        );

        const ok = await confirm(
          ask,
          `Permanently remove family "${picked.label}" (${picked.typeId})`,
          false,
        );
        if (!ok) continue;

        const result = await removeCareerPlayerAirframeFamily({
          repoRoot: opts.repoRoot,
          typeId: picked.typeId,
        });
        printKv([
          ['typeId', result.typeId],
          ['label', result.label],
          ['deleted files', String(result.deletedPaths.length)],
        ]);
        for (const path of result.deletedPaths) {
          console.log(`    deleted  ${path}`);
        }
        console.log(
          '  Restart career-ui / rebuild @msfs-compat/shared, then re-run homologate.',
        );
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
