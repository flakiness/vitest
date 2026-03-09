import { FlakinessReport } from '@flakiness/flakiness-report';
import { readReport } from '@flakiness/sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, TestContext } from 'vitest';
import { startVitest } from 'vitest/node';
import FKVitestReporter, { FKVitestReporterOptions } from '../src/reporter';

// On MacOS, the /tmp is a symlink to /private/tmp. This results
// in stack traces using `/private/tmp`. This confuses ViTest
// location parser, so our location tests fails.
// To workaround, we explicitly use `/private/tmp` on mac.
export const ARTIFACTS_DIR = process.platform === 'darwin' ? '/private/tmp/flakiness-vitest' : '/tmp/flakiness-vitest';

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

export async function generateFlakinessReport(ctx: TestContext, files: Record<string, string>, options?: FKVitestReporterOptions) {
  const targetDir = path.join(
    ARTIFACTS_DIR,
    path.relative(__dirname, ctx.task.file.filepath),
    slugify(ctx.task.fullTestName),
  );
  // Clean up any previous run and create fresh directory.
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const reportDir = path.join(targetDir, 'flakiness-report');

  // Write test files into the tmp folder.
  for (const [filePath, content] of Object.entries({ ...DEFAULT_FILES, ...files })) {
    const fullPath = path.join(targetDir, ...filePath.split('/'));
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  // Initialize a git repo and commit all files.
  execSync(`git init`, { cwd: targetDir });
  execSync(`git add .`, { cwd: targetDir });
  execSync(`git -c user.email=john@example.com -c user.name=john -c commit.gpgsign=false commit -m staging`, {
    cwd: targetDir
  });

  const reporter = new FKVitestReporter({
    ...(options ?? {}),
    outputFolder: reportDir,
    disableUpload: true,
    open: 'never',
  });
  const log: { warns: string[], errors: string[], logs: string[] } = {
    warns: [],
    errors: [],
    logs: [],
  };
  reporter.setLoggerForTest({
    error: txt => log.errors.push(txt),
    log: txt => log.logs.push(txt),
    warn: txt => log.warns.push(txt),
  });
  const vitest = await startVitest(
    'test',
    [],
    {
      root: targetDir,
      config: path.join(targetDir, 'vitest.config.ts'),
      watch: false,
      reporters: [reporter], 
      clearScreen: false,
      fileParallelism: false,
    },
  );
  await vitest?.close();
  return {
    ...(await readReport(reportDir)),
    log,
  }
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


export function assertStatus(status: FlakinessReport.TestStatus|undefined, expected: FlakinessReport.TestStatus) {
  expect(status ?? 'passed').toBe(expected);
}

export function assertCount<T>(elements: T[]|undefined, count: number): T[] {
  expect(elements?.length).toBe(count);
  return elements!;
}