import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const vitePackage = require.resolve('vite/package.json');
const viteBin = join(dirname(vitePackage), 'bin', 'vite.js');
const apiPort = Number(process.env.CAREER_UI_API_PORT ?? 8787);
const uiPort = Number(process.env.CAREER_UI_PORT ?? 5173);

async function hasHealthyApi() {
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function hasCareerUi() {
  try {
    const res = await fetch(`http://localhost:${uiPort}/`, {
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('<title>Skyline Career</title>');
  } catch {
    return false;
  }
}

const kids = [];
if (await hasHealthyApi()) {
  console.log(`Career API already running at http://127.0.0.1:${apiPort}`);
} else {
  kids.push(
    spawn(process.execPath, ['--import', 'tsx', join(root, 'server', 'api.ts')], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    }),
  );
}

if (await hasCareerUi()) {
  console.log(`Career UI already running at http://localhost:${uiPort}`);
} else {
  kids.push(
    spawn(process.execPath, [viteBin, '--port', String(uiPort), '--strictPort'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env },
    }),
  );
}

function shutdown() {
  for (const kid of kids) {
    kid.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
