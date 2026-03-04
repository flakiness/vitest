import { FlakinessReport } from '@flakiness/flakiness-report';
import { readReport } from '@flakiness/sdk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, TestContext } from 'vitest';
import { startVitest } from 'vitest/node';
import FKVitestReporter from '../src/reporter';

// On MacOS, the /tmp is a symlink to /private/tmp. This results
// in stack traces using `/private/tmp`. This confuses ViTest
// location parser, so our location tests fails.
// To workaround, we explicitly use `/private/tmp` on mac.
export const ARTIFACTS_DIR = process.platform === 'darwin' ? '/private/tmp/flakiness-vitest' : '/tmp/flakiness-vitest';

const DEFAULT_FILES = {
  'vitest.config.ts': `
    export default {};
  `,
  'package.json': JSON.stringify({
    'name': 'my-package',
    'version': '1.0.0'
  }),
}

export async function generateFlakinessReport(ctx: TestContext, files: Record<string, string>) {
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

  // Install vitest
  const reporter = new FKVitestReporter({
    outputFolder: reportDir,
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

export function assertTests(tests: FlakinessReport.Test[]|undefined, length: number): FlakinessReport.Test[] {
  expect(tests?.length ?? 0).toBe(length);
  return tests!;
}

export function assertTags(tags: string[]|undefined, length: number): string[] {
  expect(tags?.length ?? 0).toBe(length);
  return tags!;
}

export function assertAttempts(test: FlakinessReport.Test, length: number): FlakinessReport.RunAttempt[] {
  expect(test.attempts.length).toBe(length);
  return test.attempts;
}

export function assertErrors(errors: FlakinessReport.ReportError[]|undefined, length: number): FlakinessReport.ReportError[] {
  expect(errors?.length).toBe(length);
  return errors!;
}

export function assertSTDIO(stdio: FlakinessReport.TimedSTDIOEntry[]|undefined, length: number): FlakinessReport.TimedSTDIOEntry[] {
  expect(stdio?.length).toBe(length);
  return stdio!;
}