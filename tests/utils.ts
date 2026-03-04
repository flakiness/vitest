import { FlakinessReport } from '@flakiness/flakiness-report';
import { readReport } from '@flakiness/sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, TestContext } from 'vitest';

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

  // Initialize a git repo and commit all files.
  execSync(`git init`, { cwd: targetDir });
  execSync(`git add .`, { cwd: targetDir });
  execSync(`git -c user.email=john@example.com -c user.name=john commit -m staging`, {
    cwd: targetDir
  });
  // Install vitest
  execSync(`pnpm install vitest`, { cwd: targetDir });
  
  const reporterPath = path.resolve(__dirname, '..', 'lib', 'reporter.js');

  // Delete uploads from FLAKINESS_DISABLE_UPLOAD
  process.env.FLAKINESS_DISABLE_UPLOAD = '1';
  try {
    execSync(`pnpm exec vitest run --no-cache --root=${targetDir} --reporter=${reporterPath}`, {
      cwd: targetDir,
    })
  } catch (e) {
    // vitest will fail if some tests fail.
  }
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

export function assertSuites(suites: FlakinessReport.Suite[]|undefined, length: number): FlakinessReport.Suite[] {
  expect(suites?.length ?? 0).toBe(length);
  return suites!;
}

export function assertTests(suite: FlakinessReport.Suite, length: number): FlakinessReport.Test[] {
  expect(suite.tests?.length ?? 0).toBe(length);
  return suite.tests!;
}

export function assertAttempts(test: FlakinessReport.Test, length: number): FlakinessReport.RunAttempt[] {
  expect(test.attempts.length).toBe(length);
  return test.attempts;
}