#!/usr/bin/env node
/**
 * Local production-ish stack: Postgres + world-api + world-worker in Docker.
 * Desktop / gateway talks to http://127.0.0.1:8787 (economy); local gateway on 8788.
 *
 *   npm run career:stack:world
 *   npm run career:stack:world -- --build
 *   npm run career:stack:world -- --down
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const down = args.includes('--down');
const build = args.includes('--build') || !down;

const composeArgs = down
  ? ['compose', '--profile', 'world', 'down']
  : [
      'compose',
      '--profile',
      'world',
      'up',
      '-d',
      ...(build ? ['--build'] : []),
    ];

console.log(`[career:stack:world] docker ${composeArgs.join(' ')}`);
const child = spawn('docker', composeArgs, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  if (!down && (code ?? 1) === 0) {
    console.log(`
[career:stack:world] up
  World API   http://127.0.0.1:8787   (Auth + economy — no Watch)
  Worker      skyline-career-world-worker
  Postgres    127.0.0.1:5432
  Adminer     http://127.0.0.1:8081

Desktop / gateway (PowerShell):
  $env:CAREER_WORLD_API_URL = "http://127.0.0.1:8787"
  # local gateway defaults to :8788 when WORLD URL is set
  npm start -w skyline-career-desktop

Or Node gateway only (no Electron):
  $env:CAREER_WORLD_API_URL = "http://127.0.0.1:8787"
  $env:CAREER_API_MODE = "gateway"
  $env:CAREER_UI_API_PORT = "8788"
  $env:CAREER_AUTH = "0"
  npm run career:host
`);
  }
  process.exit(code ?? 0);
});
