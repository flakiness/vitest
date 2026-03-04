import type { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { GitWorktree, ReportUtils, uploadReport, writeReport } from '@flakiness/sdk';
import chalk from 'chalk';
import assert from 'node:assert';
import path from 'node:path';
import type { TestCase, TestModule, TestSuite, Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

const warn = (txt: string) => console.warn(chalk.yellow(`[flakiness.io] ${txt}`));
const err = (txt: string) => console.error(chalk.red(`[flakiness.io] ${txt}`));
const log = (txt: string) => console.log(`[flakiness.io] ${txt}`);

export default class FlakinessReporter implements Reporter {
  private _impl?: ReporterImpl;

  constructor(options: ReportOptions) {
    this._impl = ReporterImpl.create(process.cwd(), options);
  }

  onInit(vitest: Vitest) {
    this._impl?.onInit(vitest);
  }

  onTestRunStart() {
    this._impl?.onTestRunStart();
  }

  async onTestCaseResult(testCase: TestCase) {
    this._impl?.onTestCaseResult(testCase);
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    this._impl?.onTestRunEnd(testModules);
  }
}

type ReportOptions = {
  flakinessProject?: string,
  endpoint?: string,
  token?: string,
  outputFolder?: string,
}

class ReporterImpl {
  private _vitest!: Vitest;
  private _startTimestamp: number = Date.now();
  private _tests = new Map<string, FK.Test>();
  private _allSuites = new Map<string, FK.Suite>();
  private _fileSuites = new Map<string, FK.Suite>();

  static create(rootPath: string, options: ReportOptions) {
    let commitId: FK.CommitId;
    let worktree: GitWorktree;
    try {
      worktree = GitWorktree.create(rootPath);
      commitId = worktree.headCommitId();
      return new ReporterImpl(worktree, commitId, options);
    } catch (e) {
      warn(`Failed to fetch commit info - is this a git repo?`);
      err(`Report is NOT generated.`);
      return;
    }
  }

  constructor(
    private _worktree: GitWorktree,
    private _commitId: FK.CommitId,
    private _options: ReportOptions
  ) {

  }

  onInit(vitest: Vitest) {
    this._vitest = vitest;
  }

  onTestRunStart() {
    this._startTimestamp = Date.now();      
  }

  private _ensureFKSuite(p: TestSuite | TestModule): FK.Suite {
    let suite = this._allSuites.get(p.id);
    if (suite)
      return suite;
    if ('name' in p) {
      const parent = this._ensureFKSuite(p.parent);
      suite = {
        type: 'suite',
        title: p.name,
      };
      parent.suites ??= [];
      parent.suites.push(suite);
    } else {
      suite = {
        type: 'file',
        title: p.relativeModuleId,
      };
      this._fileSuites.set(p.id, suite);
    }
    this._allSuites.set(p.id, suite);
    return suite;
  }

  async onTestCaseResult(testCase: TestCase) {
    let fkTest = this._tests.get(testCase.id);
    if (!fkTest) {
      fkTest = {
        attempts: [],
        title: testCase.name,
      }
      this._tests.set(testCase.id, fkTest);
      const parent = this._ensureFKSuite(testCase.parent);
      parent.tests ??= [];
      parent.tests.push(fkTest);
    }
    const diag = testCase.diagnostic();
    assert(diag, `Diagnostic must be present in finished test cases`);;

    const result = testCase.result();
    fkTest.attempts.push({
      startTimestamp: diag.startTime as FK.UnixTimestampMS,
      duration: diag.duration as FK.DurationMS,
      status: result.state === 'failed' ? 'failed' : 
        result.state === 'skipped' ? 'skipped' : 
        'passed',
    });
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const environment = ReportUtils.createEnvironment({ name: 'default' });
    const duration = (Date.now() - this._startTimestamp) as FK.DurationMS;
    const report: FK.Report = ReportUtils.normalizeReport({
      category: 'vitest',
      commitId: this._commitId,
      environments: [environment],
      startTimestamp: this._startTimestamp as FK.UnixTimestampMS,
      duration,
      suites: Array.from(this._fileSuites.values()),
    });
    await ReportUtils.collectSources(this._worktree, report);

    const outputFolder = path.join(
      process.cwd(),
      process.env.FLAKINESS_OUTPUT_DIR ?? 'flakiness-report',
    );
    await writeReport(report, [], outputFolder);

    if (!process.env.FLAKINESS_DISABLE_UPLOAD)
      await uploadReport(report, []);
  }
}