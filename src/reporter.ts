import { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { CIUtils, CPUUtilization, GitWorktree, RAMUtilization, ReportUtils, uploadReport, writeReport } from '@flakiness/sdk';
import type { ParsedStack } from '@vitest/utils';
import chalk from 'chalk';
import crypto from 'crypto';
import assert from 'node:assert';
import path from 'node:path';
import type { SerializedError, TestCase, TestModule, TestRunEndReason, TestSuite, Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

//TODO: the following types must be imported from vitest, but the types
// are actually unavailable for imports.
interface UserConsoleLog {
  content: string;
  origin?: string;
  browser?: boolean;
  type: "stdout" | "stderr";
  taskId?: string;
  time: number;
  size: number;
}

export type FKVitestReporterOptions = {
  disableUpload?: boolean,
  flakinessProject?: string,
  endpoint?: string,
  token?: string,
  outputFolder?: string,
  duplicates?: 'fail'|'rename',
}

export interface FKVitestLogger {
  log(txt: string): void;
  warn(txt: string): void;
  error(txt: string): void;
}

export default class FKVitestReporter implements Reporter {
  private _impl?: ReporterImpl;
  private _vitest?: Vitest;
  private _logger: FKVitestLogger = {
    warn: (txt: string) => console.warn(chalk.yellow(txt)),
    error: (txt: string) => console.error(chalk.red(txt)),
    log: (txt: string) => console.log(txt),
  }

  constructor(private _options: FKVitestReporterOptions) {
  }

  setLoggerForTest(logger: FKVitestLogger) {
    this._logger = logger;
  }

  async onUserConsoleLog(log: UserConsoleLog) {
    await this._impl?.onUserConsoleLog(log);
  }

  onInit(vitest: Vitest) {
    this._vitest = vitest;
  }

  onTestRunStart() {
    assert(this._vitest, 'onInit must be called before onTestRunStart');
    // Watch mode starts multiple runs; for each test run, we create a new
    // reporter.
    this._impl = ReporterImpl.create(this._vitest.config.root, this._options, this._logger, this._vitest.config.config);
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<SerializedError>, reason: TestRunEndReason) {
    await this._impl?.onTestRunEnd(testModules, unhandledErrors, reason);
    this._impl = undefined;
  }
}

const gTestToTestCaseId = new WeakMap<FK.Test, string>();

type TestDuplicates = {
  tests: FK.Test[],
  testId: string,
  fullName: string,
}

class ReporterImpl {
  private _telemetryTimer?: NodeJS.Timeout;
  private _cpuUtilization = new CPUUtilization({ precision: 10 });
  private _ramUtilization = new RAMUtilization({ precision: 10 });

  private _startTimestamp: number = Date.now();

  private _stdio = new Map<string, UserConsoleLog[]>();

  // In Vitest, all projects MUST HAVE UNIQUE NAMES.
  // So we create environments per project name.
  private _environments: FK.Environment[] = [];

  static create(rootPath: string, options: FKVitestReporterOptions, logger: FKVitestLogger, config?: string) {
    let commitId: FK.CommitId;
    let worktree: GitWorktree;
    try {
      worktree = GitWorktree.create(rootPath);
      commitId = worktree.headCommitId();
      return new ReporterImpl(worktree, commitId, options, logger, config);
    } catch (e) {
      logger.warn(`[flakiness.io] Failed to fetch commit info - is this a git repo?`);
      logger.error(`[flakiness.io] Report is NOT generated.`);
      return;
    }
  }

  constructor(
    private _worktree: GitWorktree,
    private _commitId: FK.CommitId,
    private _options: FKVitestReporterOptions,
    private _logger: FKVitestLogger,
    private _configPath?: string,
  ) {
    this._sampleSystem = this._sampleSystem.bind(this);
    this._sampleSystem();
  }

  private _sampleSystem() {
    this._cpuUtilization.sample();
    this._ramUtilization.sample();
    this._telemetryTimer = setTimeout(this._sampleSystem, 1000);
  }

  onUserConsoleLog(log: UserConsoleLog) {
    if (!log.taskId)
      return;
    let entries = this._stdio.get(log.taskId);
    if (!entries) {
      entries = [];
      this._stdio.set(log.taskId, entries);
    }
    entries.push(log);
  }

  private _ensureEnvironmentIdx(testCase: TestCase) {
    const projectName = testCase.project.name || 'vitest';
    let idx = this._environments.findIndex(env => env.name === projectName);
    if (idx === -1) {
      idx = this._environments.length;
      this._environments.push(ReportUtils.createEnvironment({
        name: projectName,
      }));
    }
    return idx;
  }

  private _errorLocation(stacks: ParsedStack[]|undefined, testFile?: string): FK.Location | undefined {
    // Find a frame that is either in the test file, or the first outside of node_modules.
    const frame = stacks?.find(frame => this._worktree.gitPath(frame.file) === testFile) ??
        stacks?.find(frame => !frame.file.includes('node_modules'));
    return frame ? {
      file: this._worktree.gitPath(frame.file),
      line: frame.line as FK.Number1Based,
      column: frame.column as FK.Number1Based,
    } : undefined;
  }

  private _collectSuite(fkParent: FK.Suite, suite: TestSuite) {
    const fkSuite: FK.Suite = {
      type: 'suite',
      title: suite.name,
      location: suite.location ? {
        file: this._worktree.gitPath(suite.module.moduleId),
        column: suite.location.column as FK.Number1Based,
        line: suite.location.line as FK.Number1Based,
      } : undefined,
    };
    fkParent.suites ??= [];
    fkParent.suites.push(fkSuite);

    for (const s of suite.children.suites())
      this._collectSuite(fkSuite, s);
    for (const t of suite.children.tests())
      this._collectTest(fkSuite, t);
  }

  async _collectTest(fkParent: FK.Suite, testCase: TestCase) {
    const environmentIdx = this._ensureEnvironmentIdx(testCase);
    const fkTest: FK.Test = {
      attempts: [],
      title: testCase.name,
      location: testCase.location ? {
        file: this._worktree.gitPath(testCase.module.moduleId),
        column: testCase.location.column as FK.Number1Based,
        line: testCase.location.line as FK.Number1Based,
      } : undefined,
    }
    fkParent.tests ??= [];
    fkParent.tests.push(fkTest);

    gTestToTestCaseId.set(fkTest, testCase.id);

    const result = testCase.result();

    // Technically, we should never get a "pending" here, but this somehow
    // happens when running tests against vitest own tests.
    if (result.state === 'skipped' || result.state === 'pending') {
      fkTest.attempts.push({
        environmentIdx,
        annotations:
          testCase.options.mode === 'skip' ? [{ type: 'skip' }] :
          testCase.options.mode === 'todo' ? [{ type: 'todo' }] : undefined,
        startTimestamp: Date.now() as FK.UnixTimestampMS,
        duration: 0 as FK.DurationMS,
        status: 'skipped',
        expectedStatus: 'skipped',
      });
      return;
    }

    // For typecheck tests, per-case diagnostic is missing.
    // We will stub it with a startTime.
    // In this case, we fallback to module-level diagnostic since this is the
    // best we have.
    const startTime = testCase.diagnostic()?.startTime ?? this._startTimestamp;
    const duration = testCase.diagnostic()?.duration ?? testCase.module.diagnostic()?.duration ?? 0;
    const retryCount = testCase.diagnostic()?.retryCount ?? 0;

    const stdio: FK.TimedSTDIOEntry[] = [];
    let ts = startTime;
    for (const entry of this._stdio.get(testCase.id) ?? []) {
      stdio.push({
        text: entry.content,
        stream: entry.type === 'stdout' ? FK.STREAM_STDOUT : FK.STREAM_STDERR,
        dts: (entry.time - ts) as FK.DurationMS,
      });
      ts = entry.time;
    }
    this._stdio.delete(testCase.id);

    const testFile = this._worktree.gitPath(testCase.module.moduleId);
    const errors: FK.ReportError[] = (result.errors ?? []).map(error => ({
      message: error.message,
      stack: error.stack,
      location: this._errorLocation(error.stacks, testFile),
    }));

    const annotations: FK.Annotation[] = testCase.annotations().map(annotation => ({
      type: annotation.type,
      description: annotation.message,
      location: annotation.location ? {
        file: this._worktree.gitPath(annotation.location.file),
        line: annotation.location.line as FK.Number1Based,
        column: annotation.location.column as FK.Number1Based,
      } : undefined,
    }));
    if (testCase.options.fails)
      annotations.push({ type: 'fail' });

    const expectedStatus = testCase.options.fails ? 'failed' : 'passed';
    const oppositeStatus = expectedStatus === 'failed' ? 'passed' : 'failed';

    // Vitest DOES NOT give us per-retry detalization, so we have
    // to synthesize it here.
    // We will do it like this:
    // - we will have X retries, all with status "failed" and duration = 0
    // - the last retry will be "passed"
    for (let i = 0; i < retryCount; ++i) {
      fkTest.attempts.push({
        environmentIdx,
        startTimestamp: startTime as FK.UnixTimestampMS,
        duration: 0 as FK.DurationMS,
        // retries have an opposite status from expected status to
        // trigger retry.
        status: oppositeStatus,
        expectedStatus,
        // TODO: ideally, we can differentiate STDIO between attempts.
        // However, vitest doesn't let us do so easily.
        // We slice these arrays just to be safe: if someone downstream from us
        // decides to push a new annotation, then they can do it per-attempt safely.
        stdio: stdio.slice(),
        errors: errors.slice(),
        annotations: annotations.slice(),
      });
    }

    fkTest.attempts.push({
      environmentIdx,
      startTimestamp: startTime as FK.UnixTimestampMS,
      duration: duration as FK.DurationMS,
      status: result.state === 'failed' ? oppositeStatus : expectedStatus,
      expectedStatus,
      // TODO: ideally, we can differentiate STDIO between attempts.
      // However, vitest doesn't let us do so easily.
      stdio,
      errors,
      annotations
    });
  }

  private _warnDuplicates(duplicates: TestDuplicates[]) {
    const warnMessages: string[] = [];
    for (const duplicate of duplicates)
      warnMessages.push(`${duplicate.tests.length} tests: ${duplicate.fullName}`);

    this._logger.warn(`[flakiness.io] ⚠ Detected test with duplicate names!`);
    for (const warnMessage of warnMessages)
      this._logger.warn(`[flakiness.io] - ${warnMessage}`);
    this._logger.warn(`[flakiness.io] Please rename tests so that they all have unique full names.`);
  }

  private _failDuplicates(duplicates: TestDuplicates[]) {
    for (const { fullName, tests } of duplicates) {
      // Fail every test in every duped environment, make sure to fail it with
      // a duplication error and annotation.

      // The first test gets a failed attempt with annotation and error aboud
      // duplicate tests.
      const test = tests[0];
      const envs = new Set(test.attempts.map(a => a.environmentIdx ?? 0));
      test.attempts = Array.from(envs).map(envIdx => ({
        environmentIdx: envIdx,
        startTimestamp: Date.now() as FK.UnixTimestampMS,
        duration: 0 as FK.DurationMS,
        expectedStatus: 'passed',
        status: 'failed',
        errors: [{
          message: [
            `Flakiness.io detected ${tests.length} tests with identical full name "${fullName}"`,
            `Please rename tests to ensure they all have unique full names.`
          ].join('\n'),
        }],
        annotations: [{
          type: 'dupe',
          description: [
            `Flakiness.io failed to process this test because there are ${tests.length} tests with`,
            `identical full name: "${fullName}".`,
            `Please make sure that all your tests have unique full names.`,
          ].join('\n'),
        }]
      }));

      // All other tests get stripped of their attempts.
      // This results in a single attempt for the test in the Flakiness report.
      for (let i = 1; i < tests.length; ++i)
        tests[i].attempts = [];
    }
  }

  private _renameDuplicates(duplicates: TestDuplicates[], testIdToTests: Map<string, FK.Test[]>) {
    for (const { tests, testId } of duplicates) {
      // Sort tests according to their vitest identifier.
      tests.sort((test1, test2) => {
        const id1 = gTestToTestCaseId.get(test1) ?? '';
        const id2 = gTestToTestCaseId.get(test2) ?? '';
        return id1 < id2 ? -1 : id1 > id2 ? 1 : 0;
      });

      // Add dupe suffixes to duplicated tests.
      let dupeIndex = 2;
      for (let i = 1; i < tests.length; ++i) {
        while (testIdToTests.has(testId + dupeSuffix(dupeIndex)))
          ++dupeIndex;
        tests[i].title += dupeSuffix(dupeIndex);
        tests[i].attempts.forEach(attempt => {
          attempt.annotations ??= [];
          attempt.annotations.push({ type: 'dupe' });
        });
        testIdToTests.set(testId + dupeSuffix(dupeIndex), [tests[i]]);
      }
    }
  }

  private _detectDuplicates(fileSuites: FK.Suite[]): {
    duplicates: TestDuplicates[],
    testIdToTests: Map<string, FK.Test[]>,
  } {
    // Random title separator.
    const TITLE_SEPARATOR = crypto.randomBytes(128).toString('base64');

    const testIdToTests = new Map<string, FK.Test[]>();
    const testFullNames = new Map<FK.Test, string>();

    function visitSuite(suite: FK.Suite, parentTitles: string[] = []) {
      parentTitles.push(suite.title);
      for (const childSuite of suite.suites ?? [])
        visitSuite(childSuite, parentTitles);
      for (const test of suite.tests ?? []) {
        // Each test's attempts is a product of a single onTestCaseResult call.
        // All attempts for the test have the same envIdx; but just to be safe,
        // we extract them all here in a sorted deduped list.
        // We consider tests to be duplicate if they have the same sequence of suites,
        // and they're being run in the same set of environments.
        const envs = Array.from(new Set(test.attempts.map(attempt => attempt.environmentIdx ?? 0))).sort((a, b) => a - b);
        const testId = [`[${envs.join(', ')}]`, ...parentTitles, test.title].join(TITLE_SEPARATOR);
        testFullNames.set(test, [...parentTitles, test.title].join(' > '));
        let tests = testIdToTests.get(testId);
        if (!tests) {
          tests = [];
          testIdToTests.set(testId, tests);
        }
        tests.push(test);
      }
      parentTitles.pop();
    }

    for (const fileSuite of fileSuites)
      visitSuite(fileSuite);

    const duplicates: TestDuplicates[] = [];
    for (const [testId, tests] of testIdToTests) {
      if (tests.length <= 1)
        continue;
      const fullName = testFullNames.get(tests[0])!;
      duplicates.push({ fullName, testId, tests });
    }
    return { duplicates, testIdToTests };
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<SerializedError>, reason: TestRunEndReason) {
    const fileSuites = testModules.map(file => {
      const fkFileSuite: FK.Suite = {
        type: 'file',
        title: file.relativeModuleId,
        location: {
          file: this._worktree.gitPath(file.moduleId),
          column: 0 as FK.Number1Based,
          line: 0 as FK.Number1Based,
        },
      };
      for (const suite of file.children.suites())
        this._collectSuite(fkFileSuite, suite);
      for (const test of file.children.tests())
        this._collectTest(fkFileSuite, test);
      return fkFileSuite;
    });

    clearTimeout(this._telemetryTimer);
    this._cpuUtilization.sample();
    this._ramUtilization.sample();

    const { duplicates, testIdToTests } = this._detectDuplicates(fileSuites);
    if (duplicates.length) {
      this._warnDuplicates(duplicates);
      if (this._options.duplicates === 'rename') {
        this._renameDuplicates(duplicates, testIdToTests);
      } else {
        this._failDuplicates(duplicates);
      }
    }

    const duration = (Date.now() - this._startTimestamp) as FK.DurationMS;
    const report: FK.Report = ReportUtils.normalizeReport({
      url: CIUtils.runUrl(),
      flakinessProject: this._options.flakinessProject,
      category: 'vitest',
      configPath: this._configPath ? this._worktree.gitPath(this._configPath) : undefined,
      commitId: this._commitId,
      environments: this._environments,
      startTimestamp: this._startTimestamp as FK.UnixTimestampMS,
      duration,
      suites: fileSuites,
      unattributedErrors: [
        unhandledErrors,
        testModules.map(t => t.errors()).flat(),
      ].flat().map(error => ({
        message: error.message,
        stack: error.stack,
        location: this._errorLocation(error.stacks),
      })),
    });
    await ReportUtils.collectSources(this._worktree, report);
    this._cpuUtilization.enrich(report);
    this._ramUtilization.enrich(report);

    const outputFolder = this._options.outputFolder ?? path.join(
      process.cwd(),
      process.env.FLAKINESS_OUTPUT_DIR ?? 'flakiness-report',
    );
    await writeReport(report, [], outputFolder);

    const disableUpload = !!this._options.disableUpload || !!process.env.FLAKINESS_DISABLE_UPLOAD;
    if (!disableUpload) {
      await uploadReport(report, [], {
        flakinessAccessToken: this._options.token,
        flakinessEndpoint: this._options.endpoint,
        logger: this._logger,
      });
    }

    // This is exactly the same logic as @flakiness/playwright:
    // https://github.com/flakiness/playwright/blob/bd9174b6de74dc5d038815a6513de1d260544771/src/playwright-test.ts#L342C1-L357C6
    const defaultOutputFolder = path.join(process.cwd(), 'flakiness-report');
    const folder = defaultOutputFolder === outputFolder ? '' : path.relative(process.cwd(), outputFolder);
    this._logger.log(`
To open last Flakiness report, run:

  ${chalk.cyan(`npx flakiness show ${folder}`)}
    `);
  }
}

function dupeSuffix(dupeIndex: number): string {
  return ` – dupe #${dupeIndex}`;
}
