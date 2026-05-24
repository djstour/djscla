#!/usr/bin/env node
/**
 * Start `vercel dev` with .env.local + .env injected into the process env.
 * Vercel CLI does not always load .env.local for plain serverless routes.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(name) {
  const path = resolve(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const port = process.env.PORT || '3000';
const child = spawn(
  'npx',
  ['--yes', 'vercel', 'dev', '--listen', port],
  { cwd: root, env: process.env, stdio: 'inherit' },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
