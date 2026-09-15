#!/usr/bin/env node
/**
 * Local production-ish stack: Postgres + world-api + world-worker in Docker.
 * Desktop / gateway talks to http://127.0.0.1:8787 (economy); local gateway on 8788.
 *
 *   npm run career:stack:world              → lab overlay (loopback DB + Adminer)
 *   npm run career:stack:world -- --build
 *   npm run career:stack:world -- --prod    → VPS-safe (no DB publish; API 127.0.0.1)
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
const build = args.includes('--build') || !down;

const overlay = prod ? 'docker-compose.prod.yml' : 'docker-compose.lab.yml';
const fileArgs = ['-f', 'docker-compose.yml', '-f', overlay];

const composeArgs = down
  ? ['compose', ...fileArgs, '--profile', 'world', 'down']
  : [
      'compose',
      ...fileArgs,
      '--profile',
      'world',
      'up',
      '-d',
      ...(build ? ['--build'] : []),
    ];

console.log(
  `[career:stack:world] ${prod ? 'prod' : 'lab'} — docker ${composeArgs.join(' ')}`,
);
const child = spawn('docker', composeArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  if (!down && (code ?? 1) === 0) {
    if (prod) {
      console.log(`
[career:stack:world] up (prod overlay)
  World API   http://127.0.0.1:8787   (loopback only — put TLS proxy in front)
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
