#!/usr/bin/env node
/**
 * Release hygiene for Skyline Career desktop.
 *
 * Default: pack current packages/desktop version → validate artifacts →
 * gh release create with Setup + latest.yml (+ blockmap) + commit notes.
 *
 * Usage:
 *   node scripts/release-desktop.mjs
 *   node scripts/release-desktop.mjs --bump patch
 *   node scripts/release-desktop.mjs --dry-run
 *   node scripts/release-desktop.mjs --skip-pack --no-bump
 *
 * Flags:
 *   --bump patch|minor|major  Bump packages/desktop/package.json before pack
 *   --no-bump                 Keep current version (default if --bump omitted)
 *   --skip-pack               Reuse artifacts/skyline-desktop (must already match)
 *   --dry-run                 Pack + validate only; do not create GitHub release
 *   --draft                   Create the GitHub release as a draft
 *   --allow-dirty             Allow a dirty worktree (still refuses unknown files
 *                             outside the desktop package.json bump)
 *   --yes                     Skip interactive confirmation
 */
import { spawn } from 'node:child_process';
import {
  access,
  readFile,
  writeFile,
  readdir,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktopPkgPath = join(root, 'packages', 'desktop', 'package.json');
const outDir = join(root, 'artifacts', 'skyline-desktop');

function parseArgs(argv) {
  const flags = {
    bump: null,
    noBump: false,
    skipPack: false,
    dryRun: false,
    draft: false,
    allowDirty: false,
    yes: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bump') {
      const kind = argv[++i];
      if (!['patch', 'minor', 'major'].includes(kind)) {
        throw new Error(`--bump expects patch|minor|major (got ${kind ?? 'nothing'})`);
      }
      flags.bump = kind;
    } else if (a === '--no-bump') flags.noBump = true;
    else if (a === '--skip-pack') flags.skipPack = true;
    else if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--draft') flags.draft = true;
    else if (a === '--allow-dirty') flags.allowDirty = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--help' || a === '-h') flags.help = true;
    else throw new Error(`Unknown flag: ${a}`);
  }
  if (flags.bump && flags.noBump) {
    throw new Error('Use either --bump or --no-bump, not both');
  }
  if (!flags.bump) flags.noBump = true;
  return flags;
}

function run(command, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: opts.shell ?? false,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
    });
    let stdout = '';
    let stderr = '';
    if (opts.capture) {
      child.stdout?.on('data', (d) => {
        stdout += d;
      });
      child.stderr?.on('data', (d) => {
        stderr += d;
      });
    }
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr, code });
      else {
        const detail = opts.capture
          ? `${stderr || stdout}`.trim() || `exit ${code}`
          : `exit ${code}`;
        reject(new Error(`${command} ${args.join(' ')} failed: ${detail}`));
      }
    });
  });
}

async function runCapture(command, args, opts = {}) {
  const { stdout } = await run(command, args, { ...opts, capture: true });
  return stdout.trim();
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function bumpSemver(version, kind) {
  const m = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!m) throw new Error(`Invalid semver in desktop package.json: ${version}`);
  let major = Number(m[1]);
  let minor = Number(m[2]);
  let patch = Number(m[3]);
  if (kind === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function printHelp() {
  console.log(`Skyline Career — desktop release

Usage:
  npm run release:desktop -- [flags]

Flags:
  --bump patch|minor|major  Bump packages/desktop version before pack
  --no-bump                 Keep current version (default)
  --skip-pack               Validate/publish existing artifacts only
  --dry-run                 Pack + validate; do not publish
  --draft                   Create a draft GitHub release
  --allow-dirty             Allow dirty worktree
  --yes                     Skip confirmation prompt
`);
}

async function assertGh() {
  try {
    // shell:false so argv with spaces (e.g. --title) are not re-split on Windows.
    await runCapture('gh', ['--version']);
  } catch {
    throw new Error(
      'GitHub CLI (gh) not found on PATH. Install https://cli.github.com/ and run gh auth login.',
    );
  }
  try {
    await runCapture('gh', ['auth', 'status']);
  } catch {
    throw new Error('gh is not authenticated. Run: gh auth login');
  }
}

async function assertGitClean(allowDirty) {
  const status = await runCapture('git', ['status', '--porcelain']);
  if (!status) return;
  if (allowDirty) {
    console.warn('[release:desktop] WARNING: dirty worktree (--allow-dirty)\n' + status);
    return;
  }
  throw new Error(
    `Worktree is dirty — commit/stash first, or pass --allow-dirty.\n${status}`,
  );
}

async function readDesktopPkg() {
  return JSON.parse(await readFile(desktopPkgPath, 'utf8'));
}

async function writeDesktopVersion(next) {
  const pkg = await readDesktopPkg();
  pkg.version = next;
  await writeFile(desktopPkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

async function lastDesktopTag() {
  try {
    const tags = await runCapture('git', [
      'tag',
      '-l',
      'v*',
      '--sort=-v:refname',
    ]);
    const first = tags.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)[0];
    return first || null;
  } catch {
    return null;
  }
}

async function buildReleaseNotes(version, previousTag) {
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD';
  let log = '';
  try {
    log = await runCapture('git', [
      'log',
      range,
      '--pretty=format:- %s (%h)',
      '--no-merges',
    ]);
  } catch {
    log = '';
  }
  const commits = log
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
  const lines = [
    `## Skyline Career ${version}`,
    '',
    'Desktop install + in-app auto-update (`latest.yml`).',
    '',
    '### Changes',
    ...(commits.length ? commits : ['- (no commit messages since previous tag)']),
    '',
    '### Install',
    `1. Download **SkylineCareer-Setup-${version}.exe**`,
    '2. Run the installer (unsigned builds: More info → Run anyway)',
    '3. Launch **Skyline Career** from Start Menu',
    '',
    '### Smoke checklist',
    '- [ ] Fresh install opens; profile create/select works',
    '- [ ] SimBridge connects with MSFS loaded',
    '- [ ] Short Dispatch hop: Watch → airborne → engines off → settle → debrief',
    '- [ ] Settings → Updates sees this release (from an older install)',
    '- [ ] `%AppData%\\Skyline Career\\` profiles survive update',
    '',
  ];
  return lines.join('\n');
}

function parseLatestYmlVersion(text) {
  const m = text.match(/^\s*version:\s*['"]?([^'"\s]+)/m);
  return m ? m[1].trim() : null;
}

async function validateArtifacts(version) {
  const setupName = `SkylineCareer-Setup-${version}.exe`;
  const setupPath = join(outDir, setupName);
  const latestPath = join(outDir, 'latest.yml');

  if (!(await exists(setupPath))) {
    throw new Error(`Missing installer: ${setupPath}`);
  }
  if (!(await exists(latestPath))) {
    throw new Error(`Missing auto-update metadata: ${latestPath}`);
  }

  const { stat } = await import('node:fs/promises');
  const st = await stat(setupPath);
  const minBytes = 40 * 1024 * 1024; // pack already guards; soft floor here
  if (st.size < minBytes) {
    throw new Error(
      `Setup looks too small (${st.size} bytes) — pack may have produced a stub`,
    );
  }

  const latestText = await readFile(latestPath, 'utf8');
  const latestVer = parseLatestYmlVersion(latestText);
  if (latestVer !== version) {
    throw new Error(
      `latest.yml version "${latestVer}" !== desktop package.json "${version}"`,
    );
  }
  if (!latestText.includes(setupName) && !latestText.includes(`Setup-${version}`)) {
    console.warn(
      `[release:desktop] WARNING: latest.yml may not reference ${setupName} — check path field`,
    );
  }

  const listing = await readdir(outDir);
  const blockmap = listing.find(
    (f) =>
      f === `${setupName}.blockmap` ||
      f === `SkylineCareer-Setup-${version}.exe.blockmap`,
  );

  return {
    setupPath,
    latestPath,
    blockmapPath: blockmap ? join(outDir, blockmap) : null,
    setupBytes: st.size,
  };
}

async function confirm(flags, summary) {
  console.log(summary);
  if (flags.yes || flags.dryRun) return;
  if (!input.isTTY) {
    throw new Error('Non-interactive shell — pass --yes to publish');
  }
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      throw new Error('Aborted');
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }

  console.log('[release:desktop] checking preconditions…');
  await assertGitClean(flags.allowDirty);
  if (!flags.dryRun) await assertGh();

  let pkg = await readDesktopPkg();
  let version = pkg.version;
  let bumped = false;
  if (flags.bump) {
    const next = bumpSemver(version, flags.bump);
    console.log(`[release:desktop] bump ${version} → ${next} (${flags.bump})`);
    await writeDesktopVersion(next);
    version = next;
    bumped = true;
    pkg = await readDesktopPkg();
  } else {
    console.log(`[release:desktop] using version ${version} (--no-bump)`);
  }

  const tag = `v${version}`;
  const previousTag = await lastDesktopTag();
  if (previousTag === tag && !flags.dryRun) {
    throw new Error(
      `Git tag ${tag} already exists locally. Delete it or bump the version.`,
    );
  }

  if (!flags.skipPack) {
    console.log('[release:desktop] packing…');
    await run('npm', ['run', 'pack:desktop'], { shell: true });
  } else {
    console.log('[release:desktop] --skip-pack: reusing artifacts');
  }

  console.log('[release:desktop] validating artifacts…');
  const artifacts = await validateArtifacts(version);
  console.log(
    `[release:desktop] OK ${artifacts.setupPath} (${Math.round(artifacts.setupBytes / 1024 / 1024)} MiB)`,
  );
  console.log(`[release:desktop] OK ${artifacts.latestPath} (version=${version})`);
  if (artifacts.blockmapPath) {
    console.log(`[release:desktop] OK ${artifacts.blockmapPath}`);
  } else {
    console.log('[release:desktop] (no .blockmap — optional)');
  }

  const notes = await buildReleaseNotes(version, previousTag);
  const notesPath = join(outDir, `RELEASE_NOTES_${version}.md`);
  await writeFile(notesPath, notes, 'utf8');

  const assetArgs = [artifacts.setupPath, artifacts.latestPath];
  if (artifacts.blockmapPath) assetArgs.push(artifacts.blockmapPath);

  const summary = [
    '',
    '═══ Release plan ═══',
    `  tag:      ${tag}`,
    `  title:    Skyline Career ${version}`,
    `  previous: ${previousTag ?? '(none)'}`,
    `  draft:    ${flags.draft}`,
    `  dry-run:  ${flags.dryRun}`,
    `  assets:`,
    ...assetArgs.map((a) => `    - ${a}`),
    `  notes:    ${notesPath}`,
    '',
  ].join('\n');

  await confirm(flags, summary);

  if (flags.dryRun) {
    console.log('[release:desktop] dry-run complete — no GitHub release created');
    console.log(`[release:desktop] notes preview:\n${notes}`);
    return;
  }

  // Refuse if remote tag/release already exists.
  try {
    await runCapture('gh', ['release', 'view', tag]);
    throw new Error(`GitHub release ${tag} already exists`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already exists/i.test(msg)) throw err;
    // gh release view fails when missing — expected
  }

  if (bumped) {
    console.log('[release:desktop] committing version bump…');
    await run('git', ['add', 'packages/desktop/package.json']);
    await run('git', ['commit', '-m', `Release desktop ${tag}`]);
  }

  console.log(`[release:desktop] creating GitHub release ${tag}…`);
  const ghArgs = [
    'release',
    'create',
    tag,
    ...assetArgs,
    '--title',
    `Skyline Career ${version}`,
    '--notes-file',
    notesPath,
  ];
  if (flags.draft) ghArgs.push('--draft');
  // Never shell:true here — Windows re-tokenizes unquoted spaces in --title.
  await run('gh', ghArgs);

  if (bumped) {
    console.log('[release:desktop] pushing commit…');
    await run('git', ['push', '-u', 'origin', 'HEAD']);
  }

  console.log(`[release:desktop] published ${tag}`);
  console.log(
    `[release:desktop] https://github.com/daniielsantos/skyline-career/releases/tag/${tag}`,
  );
  console.log(`
Smoke checklist (manual):
  [ ] Install SkylineCareer-Setup-${version}.exe on a clean profile/VM
  [ ] App opens; create/select profile
  [ ] SimBridge + short Dispatch flight → settle
  [ ] From an older install: Settings → Updates → download/install this build
  [ ] Confirm AppData profiles survived
`);
}

main().catch((err) => {
  console.error('[release:desktop] FAILED', err instanceof Error ? err.message : err);
  process.exit(1);
});
