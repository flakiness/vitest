import { FlakinessReport } from '@flakiness/flakiness-report';
import { readReport, ReportUtils } from '@flakiness/sdk';
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

  // Temporary projects have no dependencies of their own, so anything they
  // import - `@vitest/browser-playwright` in a Browser Mode config, say - is
  // resolved through this link. Note that it is created *after* the commit
  // above, so it never ends up in the temporary git repo, and that recursive
  // deletes never follow it (see the cleanup at the top of this function).
  //
  // The whole tree is linked rather than individual packages because pnpm keeps
  // the real packages in `node_modules/.pnpm` and symlinks to them from there.
  fs.symlinkSync(
    path.join(__dirname, '..', 'node_modules'),
    path.join(targetDir, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const reporter = new FKVitestReporter({
    ...(options ?? {}),
    outputFolder: reportDir,
    disableUpload: true,
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
      // Vitest resolves `updateSnapshot` to 'none' when it detects CI, and the
      // temporary project inherits our own CI environment. Under 'none' a
      // missing reference screenshot is never created - it is written to the
      // diffs directory instead - so `toMatchScreenshot()` reports a missing
      // reference forever and never a real comparison. Pin the value so these
      // runs behave the same on a laptop and on CI.
      update: 'new',
    },
    {
      // Vite caches optimized dependencies in `<root>/node_modules/.vite`,
      // which the link above redirects into this repository. Keep the cache
      // inside the temporary project instead: concurrent test runs would
      // otherwise fight over one shared cache directory.
      cacheDir: path.join(targetDir, '.vite-cache'),
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

/**
 * Names of the attempt's attachments, in report order. Handy to assert the
 * whole set at once: `expect(attachmentNames(attempt)).toEqual([...])`.
 */
export function attachmentNames(attempt: FlakinessReport.RunAttempt): string[] {
  return (attempt.attachments ?? []).map(attachment => attachment.name);
}

export function assertAttachment(attempt: FlakinessReport.RunAttempt, name: string, contentType: string): FlakinessReport.Attachment {
  const found = attempt.attachments?.find(attachment => attachment.name === name);
  expect(found, `attachment "${name}" should be reported`).toBeDefined();
  expect(found!.contentType).toBe(contentType);
  return found!;
}

/**
 * Reads the content of an attachment that was written next to the report.
 * `attachments` is the list returned by `generateFlakinessReport()`.
 */
export async function readAttachment(attachments: ReportUtils.FileAttachment[], attachment: FlakinessReport.Attachment): Promise<Buffer> {
  const found = attachments.find(stored => stored.id === attachment.id);
  expect(found, `attachment "${attachment.name}" should be written next to the report`).toBeDefined();
  return await fs.promises.readFile(found!.path);
}
