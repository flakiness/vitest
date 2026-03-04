import { readReport } from '@flakiness/sdk';
import type { SpawnOptions } from 'child_process';
import { spawn } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TestContext } from 'vitest';

const VITEST_CLI = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const artifactsDir = '/tmp/flakiness-vitest';

export async function generateFlakinessReport(ctx: TestContext, files: Record<string, string>) {
  const targetDir = path.join(
    artifactsDir,
    path.relative(__dirname, ctx.task.file.filepath),
    slugify(ctx.task.fullTestName),
  );
  // Clean up any previous run and create fresh directory.
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  // Write a minimal vitest config if none is given.
  // This is required so that vitest does not pick the root config.
  if (!files['vitest.config.ts']) {
    files['vitest.config.ts'] = `
      import { defineConfig } from 'vitest/config';
      export default defineConfig({});
    `;
  }

  const reportDir = path.join(targetDir, 'flakiness-report');

  // Write test files into the tmp folder.
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  // Initialize package.json
  await spawnAsync(NPM, ['init', '-y'], { cwd: targetDir });
  // Initialize a git repo and commit all files.
  await spawnAsync('git', ['init'], { cwd: targetDir });
  await spawnAsync('git', ['add', '.'], { cwd: targetDir });
  await spawnAsync('git', [
    '-c', 'user.email=john@example.com',
    '-c', 'user.name=john',
    'commit', 
    '-m',
    'staging'
  ], { cwd: targetDir });
  // Install vitest
  await spawnAsync(PNPM, ['install', 'vitest'], { cwd: targetDir });
  
  const reporterPath = path.resolve(__dirname, '..', 'lib', 'reporter.js');
  await spawnAsync(VITEST_CLI, [
    `run`,
    `--no-cache`,
    `--root=${targetDir}`,
    `--reporter=${reporterPath}`,
  ], {
    cwd: targetDir,
  });
  return readReport(reportDir);
}

type SpawnResult = {
  stdout: string,
  stderr: string,
  code: number|null,
};

function spawnAsync(cmd: string, args: string[], options: SpawnOptions = {}): Promise<SpawnResult> {
  // console.log(`${cmd} ${args.join(' ')}`)
  const process = spawn(cmd, args, Object.assign({ windowsHide: true }, options));

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    if (process.stdout)
      process.stdout.on('data', data => stdout += data.toString());
    if (process.stderr)
      process.stderr.on('data', data => stderr += data.toString());
    process.on('close', code => resolve({ code, stdout, stderr, }));
    process.on('error', error => reject(error));
  });
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