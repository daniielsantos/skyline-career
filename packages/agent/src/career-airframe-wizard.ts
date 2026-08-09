/**
 * Interactive list / disable / enable / rename / remove for Skyline Career Market airframes.
 */
import {
  confirm,
  printKv,
  printSection,
  withPrompts,
  type AskFn,
} from './prompt.js';
import {
  familyPackRelPaths,
  listCareerPlayerAirframeCatalog,
  listFamilyMatchTitles,
  removeCareerPlayerAirframeFamily,
  setCareerPlayerAirframeEnabled,
  setCareerPlayerAirframeLabel,
  suggestShortMarketLabel,
} from './career-player-airframe-catalog.js';

type CatalogRow = Awaited<
  ReturnType<typeof listCareerPlayerAirframeCatalog>
>[number];

function isEnabled(row: CatalogRow): boolean {
  return row.enabled !== false;
}

function haystackIncludes(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

async function printCatalog(
  repoRoot: string,
  rows: CatalogRow[],
  opts?: { startIndex?: number },
): Promise<void> {
  if (rows.length === 0) {
    console.log('  (no player airframes registered)');
    return;
  }
  const start = opts?.startIndex ?? 1;
  for (const [i, row] of rows.entries()) {
    const flag = isEnabled(row) ? 'enabled ' : 'disabled';
    const packCount = familyPackRelPaths(row).length;
    const family = packCount > 1 ? ` · family×${packCount}` : '';
    console.log(
      `  ${String(start + i).padStart(2)}. [${flag}]  ${row.label}  (${row.typeId} · ${row.aircraftClassId}${family})`,
    );
    console.log(
      `       simbrief ${row.simbriefIcao}/${row.simbriefAirframeMatch} · ${row.rolesPackRelPath}`,
    );
    const titles = await listFamilyMatchTitles({ repoRoot, row });
    if (titles.length === 0) {
      console.log('       (no matchTitles in roles packs)');
      continue;
    }
    for (const title of titles) {
      console.log(`       · ${title}`);
    }
  }
}

/** Filter Market families by label, typeId, class, SimBrief ICAO, or sim titles. */
async function searchCatalog(
  repoRoot: string,
  rows: CatalogRow[],
  query: string,
): Promise<CatalogRow[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: CatalogRow[] = [];
  for (const row of rows) {
    const fields = [
      row.label,
      row.typeId,
      row.aircraftClassId,
      row.simbriefIcao,
      row.simbriefAirframeMatch,
      row.rolesPackRelPath,
      ...(row.familyRolesPackRelPaths ?? []),
    ];
    if (fields.some((f) => haystackIncludes(String(f), q))) {
      hits.push(row);
      continue;
    }
    const titles = await listFamilyMatchTitles({ repoRoot, row });
    if (titles.some((t) => haystackIncludes(t, q))) {
      hits.push(row);
    }
  }
  return hits;
}

async function pickRow(
  ask: AskFn,
  question: string,
  repoRoot: string,
  rows: CatalogRow[],
): Promise<CatalogRow | null> {
  if (rows.length === 0) {
    console.log('  Nothing to pick.');
    return null;
  }
  await printCatalog(repoRoot, rows);
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
    console.log('  Rename the board title, or remove a family to re-homologate.');
    console.log('  Nested lines are sim titles covered by each Market family.');
    console.log('  Use Search to check whether a title / ICAO is already registered.');

    for (;;) {
      const rows = await listCareerPlayerAirframeCatalog(opts.repoRoot);
      console.log('');
      await printCatalog(opts.repoRoot, rows);
      console.log('');
      console.log('  Actions:');
      console.log('    1. Refresh list');
      console.log('    2. Disable a model (hide from Market)');
      console.log('    3. Enable a model (show on Market)');
      console.log('    4. Rename Market label (board title only)');
      console.log('    5. Remove family (catalog + packs + profiles)');
      console.log('    6. Search catalog (label / typeId / ICAO / sim title)');
      console.log('    7. Quit');

      const action = (await ask('Choice', '7')).trim().toLowerCase();
      if (!action || action === '7' || action === 'q' || action === 'quit') {
        break;
      }
      if (action === '1' || action === 'list' || action === 'refresh') {
        continue;
      }

      if (
        action === '6' ||
        action === 'search' ||
        action === 'find' ||
        action === 's' ||
        action === '/'
      ) {
        if (rows.length === 0) {
          console.log('  Catalog is empty.');
          continue;
        }
        const query = (
          await ask('Search (label, typeId, ICAO, or sim title)', '')
        ).trim();
        if (!query) {
          console.log('  Empty query — cancelled.');
          continue;
        }
        const hits = await searchCatalog(opts.repoRoot, rows, query);
        console.log('');
        if (hits.length === 0) {
          console.log(`  No Market family matches "${query}".`);
          console.log(
            '  Tip: homologate first if this is a new aircraft, or try a shorter token (e.g. DA50, baron).',
          );
          continue;
        }
        console.log(
          `  ${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}":`,
        );
        await printCatalog(opts.repoRoot, hits);
        continue;
      }

      if (
        action === '4' ||
        action === 'rename' ||
        action === 'label' ||
        action === 'n'
      ) {
        if (rows.length === 0) {
          console.log('  Catalog is empty.');
          continue;
        }
        const picked = await pickRow(
          ask,
          'Rename which Market family',
          opts.repoRoot,
          rows,
        );
        if (!picked) continue;
        const suggestion = suggestShortMarketLabel(picked.label);
        console.log(`  Current label: ${picked.label}`);
        const nextLabel = (await ask('New Market label', suggestion)).trim();
        if (!nextLabel) {
          console.log('  Empty label — cancelled.');
          continue;
        }
        if (nextLabel === picked.label) {
          console.log('  Unchanged.');
          continue;
        }
        const ok = await confirm(
          ask,
          `Rename "${picked.label}" → "${nextLabel}"`,
          true,
        );
        if (!ok) continue;
        try {
          const updated = await setCareerPlayerAirframeLabel({
            repoRoot: opts.repoRoot,
            typeId: picked.typeId,
            label: nextLabel,
          });
          printKv([
            ['typeId', updated.typeId],
            ['label', updated.label],
          ]);
          console.log(
            '  Restart career-ui / rebuild @msfs-compat/shared if the board does not refresh.',
          );
        } catch (error) {
          console.log(
            `  ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        continue;
      }

      if (
        action === '5' ||
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
          opts.repoRoot,
          rows,
        );
        if (!picked) continue;

        const packs = familyPackRelPaths(picked);
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
        opts.repoRoot,
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
