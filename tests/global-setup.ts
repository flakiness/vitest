import fs from 'node:fs';
import path from 'node:path';

export function setup() {
  const artifactsDir = path.join(__dirname, 'run-artifacts');
  fs.rmSync(artifactsDir, { recursive: true, force: true });
}
