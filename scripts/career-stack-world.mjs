#!/usr/bin/env node
/**
 * Local production-ish stack: Postgres + world-api + world-worker in Docker.
 * Desktop / gateway talks to http://127.0.0.1:8787 (economy); local gateway on 8788.
 *
 *   npm run career:stack:world              → lab overlay (loopback DB + Adminer)
 *   npm run career:stack:world -- --build
 *   npm run career:stack:world -- --prod    → VPS-safe (no DB publish; API 127.0.0.1)
 *   npm run career:stack:world -- --prod --tls  → + Caddy HTTPS (CAREER_WORLD_HOST)
 *   npm run career:stack:world -- --down
 *   npm run career:stack:world -- --prod --down
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const down = args.includes('--down');
const prod = args.includes('--prod');
const tls = args.includes('--tls');
const build = args.includes('--build') || !down;

if (tls && !prod) {
  console.error(
    '[career:stack:world] --tls requires --prod (Caddy lives in docker-compose.prod.yml)',
  );
  process.exit(1);
}

const overlay = prod ? 'docker-compose.prod.yml' : 'docker-compose.lab.yml';
const fileArgs = ['-f', 'docker-compose.yml', '-f', overlay];
const profiles = ['world'];
if (tls) profiles.push('tls');

const profileArgs = profiles.flatMap((p) => ['--profile', p]);

const composeArgs = down
  ? ['compose', ...fileArgs, ...profileArgs, 'down']
  : [
      'compose',
      ...fileArgs,
      ...profileArgs,
      'up',
      '-d',
      ...(build ? ['--build'] : []),
    ];

const modeLabel = prod ? (tls ? 'prod+tls' : 'prod') : 'lab';
console.log(
  `[career:stack:world] ${modeLabel} — docker ${composeArgs.join(' ')}`,
);
const child = spawn('docker', composeArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  if (!down && (code ?? 1) === 0) {
    if (prod && tls) {
      console.log(`
[career:stack:world] up (prod + Caddy TLS)
  HTTPS       https://$CAREER_WORLD_HOST  (Let's Encrypt via Caddy)
  World API   http://127.0.0.1:8787        (loopback; Caddy proxies on Docker net)
  Postgres    Docker network only

Desktop:
  CAREER_WORLD_API_URL=https://<CAREER_WORLD_HOST>
`);
    } else if (prod) {
      console.log(`
[career:stack:world] up (prod overlay)
  World API   http://127.0.0.1:8787   (loopback only — add --tls for Caddy)
  Worker      skyline-career-world-worker
  Postgres    Docker network only (no host :5432)
  Adminer     not started

  DB from your PC: SSH tunnel or Tailscale — see docs/agent-context/14-mp-world-clock.md
`);
    } else {
      console.log(`
[career:stack:world] up (lab overlay)
  World API   http://127.0.0.1:8787   (Auth + economy — no Watch)
  Worker      skyline-career-world-worker
  Postgres    127.0.0.1:5432
  Adminer     http://127.0.0.1:8081

Desktop / gateway (PowerShell):
  $env:CAREER_WORLD_API_URL = "http://127.0.0.1:8787"
  npm start -w skyline-career-desktop

Or Node gateway only (no Electron):
  $env:CAREER_WORLD_API_URL = "http://127.0.0.1:8787"
  $env:CAREER_API_MODE = "gateway"
  $env:CAREER_UI_API_PORT = "8788"
  $env:CAREER_AUTH = "0"
  npm run career:host
`);
    }
  }
  process.exit(code ?? 0);
});
