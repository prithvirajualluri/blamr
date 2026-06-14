import * as fs from 'fs';
import * as path from 'path';
import type { BlamrMlBundle } from './math';

let cached: BlamrMlBundle | null = null;

function resolveModelPath(): string {
  const name = 'blamr-ml-bundle.json';
  const candidates = [
    path.join(__dirname, '..', 'models', name),
    path.join(__dirname, 'models', name),
    path.join(process.cwd(), 'packages', 'ml', 'models', name),
    path.join(process.cwd(), 'node_modules', '@blamr', 'ml', 'dist', 'models', name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`ML model bundle not found. Run: cd training && python train.py`);
}

export function loadMlBundle(force = false): BlamrMlBundle {
  if (cached && !force) return cached;
  const raw = fs.readFileSync(resolveModelPath(), 'utf8');
  cached = JSON.parse(raw) as BlamrMlBundle;
  return cached;
}

export function clearMlBundleCache(): void {
  cached = null;
}
