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

async function startNodeMock() {
  console.log('[smoke] starting Node mock-host (set MSFS_COMPAT_NATIVE=1 to prefer C#)...');
  await access(mockHost);
  return spawn(process.execPath, [mockHost, '--pipe', pipeName], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function startHost() {
  const nativeFlag = (process.env.MSFS_COMPAT_NATIVE ?? '').trim().toLowerCase();
  const preferNative =
    nativeFlag === '1' || nativeFlag === 'true' || process.argv.includes('--native');

  if (!preferNative) {
    return startNodeMock();
  }

  if (!(await hasDotnetSdk())) {
    console.warn('[smoke] .NET SDK not found — falling back to Node mock-host');
    return startNodeMock();
  }

  try {
    console.log('[smoke] building and starting C# SimBridgeHost...');
    await run('dotnet', ['build', hostProject, '-c', 'Release'], { shell: true });
    return spawn(
      'dotnet',
      ['run', '--project', hostProject, '-c', 'Release', '--no-build', '--', '--mode', 'mock', '--pipe', pipeName],
      { cwd: root, stdio: 'inherit', shell: true, windowsHide: true },
    );
  } catch (error) {
    console.warn(
      '[smoke] native host failed — falling back to Node mock-host:',
      error instanceof Error ? error.message : error,
    );
    return startNodeMock();
  }
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
