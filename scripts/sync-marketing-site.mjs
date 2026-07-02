#!/usr/bin/env node
/**
 * Copy marketing-site static assets into apps/web/public for co-deployment with the operator SPA.
 * Node equivalent of sync-marketing-site.sh — no bash/rsync required (Docker-friendly).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'marketing-site');
const dst = join(root, 'apps/web/public');

function copyDirRecursive(from, to, exclude = new Set()) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (exclude.has(entry)) continue;
    const fromPath = join(from, entry);
    const toPath = join(to, entry);
    if (statSync(fromPath).isDirectory()) {
      copyDirRecursive(fromPath, toPath);
    } else {
      cpSync(fromPath, toPath);
    }
  }
}

mkdirSync(join(dst, 'assets'), { recursive: true });
copyDirRecursive(src, dst, new Set(['index.html']));

cpSync(join(src, 'index.html'), join(dst, 'home.html'));
cpSync(join(src, 'open-console.html'), join(dst, 'open-console.html'));
cpSync(join(src, 'assets/blamr_favicon.svg'), join(dst, 'blamr_favicon.svg'));
cpSync(join(src, 'assets/blamr_logo.svg'), join(dst, 'blamr_logo.svg'));

const manifest = join(dst, 'site.webmanifest');
if (!existsSync(manifest)) {
  try {
    const content = execSync('git show HEAD:apps/web/public/site.webmanifest', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    writeFileSync(manifest, content);
  } catch {
    // no committed manifest fallback
  }
}

console.log('Synced marketing-site → apps/web/public (landing at /home.html)');
