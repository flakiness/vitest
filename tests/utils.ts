import { readReport } from '@flakiness/sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TestContext } from 'vitest';

const VITEST_CLI = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const artifactsDir = '/tmp/flakiness-vitest';

const DEFAULT_FILES = {
  'vitest.config.ts': `
    import { defineConfig } from 'vitest/config';
    export default defineConfig({});
  `,
  'package.json': JSON.stringify({
    'name': 'my-package',
    'version': '1.0.0'
  }),
}

export async function generateFlakinessReport(ctx: TestContext, files: Record<string, string>) {
  const targetDir = path.join(
    artifactsDir,
    path.relative(__dirname, ctx.task.file.filepath),
    slugify(ctx.task.fullTestName),
  );
  // Clean up any previous run and create fresh directory.
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });


  const reportDir = path.join(targetDir, 'flakiness-report');

  // Write test files into the tmp folder.
  for (const [filePath, content] of Object.entries({ ...DEFAULT_FILES, ...files })) {
    const fullPath = path.join(targetDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  // Initialize a git repo and commit all files.
  await execSync(`git init`, { cwd: targetDir });
  await execSync(`git add .`, { cwd: targetDir });
  await execSync(`git -c user.email=john@example.com -c user.name=john commit -m staging`, {
    cwd: targetDir
  });
  // Install vitest
  await execSync(`pnpm install vitest`, { cwd: targetDir });
  
  const reporterPath = path.resolve(__dirname, '..', 'lib', 'reporter.js');

  // Delete uploads from FLAKINESS_DISABLE_UPLOAD
  process.env.FLAKINESS_DISABLE_UPLOAD = '1';
  await execSync(`${VITEST_CLI} run --no-cache --root=${targetDir} --reporter=${reporterPath}`, {
    cwd: targetDir,
  });
  delete process.env.FLAKINESS_DISABLE_UPLOAD;
  return readReport(reportDir);
}

function slugify(text: string) {
  return text
    // Replace anything not alphanumeric or dash with dash
    .replace(/[^.a-zA-Z0-9-]+/g, '-')
    // Collapse multiple dashes
    .replace(/-+/g, '-')
    // Trim leading/trailing dash
    .replace(/^-|-$/g, '')
    .toLowerCase();
}