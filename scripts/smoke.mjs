import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { access } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pipeName = process.env.MSFS_COMPAT_PIPE ?? `msfs-compat-smoke-${process.pid}`;
const profile = join(root, 'profiles', 'examples', 'asobo-c172-skyhawk.json');
const agentCli = join(root, 'packages', 'agent', 'dist', 'cli.js');
const mockHost = join(root, 'packages', 'agent', 'dist', 'mock-host.js');
const hostProject = join(root, 'native', 'SimBridgeHost', 'SimBridgeHost.csproj');

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: opts.stdio ?? 'inherit',
      env: { ...process.env, ...opts.env },
      shell: opts.shell ?? false,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPing(attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      await run(process.execPath, [agentCli, 'ping', '--pipe', pipeName], { stdio: 'ignore' });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('SimBridgeHost did not become ready');
}

async function hasDotnetSdk() {
  try {
    await run('dotnet', ['--list-sdks'], { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

async function startHost() {
  const preferNative = process.env.MSFS_COMPAT_NATIVE === '1' || process.argv.includes('--native');
  const useNative = preferNative && (await hasDotnetSdk());

  let child;

  if (useNative) {
    console.log('[smoke] building and starting C# SimBridgeHost...');
    await run('dotnet', ['build', hostProject, '-c', 'Release'], { shell: true });
    child = spawn(
      'dotnet',
      ['run', '--project', hostProject, '-c', 'Release', '--no-build', '--', '--mode', 'mock', '--pipe', pipeName],
      { cwd: root, stdio: 'inherit', shell: true, windowsHide: true },
    );
  } else {
    if (preferNative) {
      console.warn('[smoke] .NET SDK not found — falling back to Node mock-host');
    } else {
      console.log('[smoke] starting Node mock-host (set MSFS_COMPAT_NATIVE=1 to prefer C#)...');
    }
    await access(mockHost);
    child = spawn(process.execPath, [mockHost, '--pipe', pipeName], {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  return child;
}

console.log(`[smoke] pipe=${pipeName}`);
const host = await startHost();

let exitCode = 0;
try {
  await waitForPing();
  console.log('[smoke] applying C172 profile via NamedPipeSimBridge + ProfileEngine...');
  await run(process.execPath, [agentCli, 'smoke', '--profile', profile, '--pipe', pipeName]);
  console.log('[smoke] OK');
} catch (error) {
  console.error('[smoke] FAILED', error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  if (host.pid) {
    try {
      process.kill(host.pid);
    } catch {
      host.kill();
    }
  }
  process.exit(exitCode);
}
