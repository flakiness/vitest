import fs from 'node:fs';
import { ARTIFACTS_DIR } from './utils';

export function setup() {
  fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
}
