import type { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { GitWorktree, ReportUtils, writeReport } from '@flakiness/sdk';
import chalk from 'chalk';
import assert from 'node:assert';
import path from 'node:path';
import type { TestCase, TestModule, TestSuite, Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

const warn = (txt: string) => console.warn(chalk.yellow(`[flakiness.io] ${txt}`));
const err = (txt: string) => console.error(chalk.red(`[flakiness.io] ${txt}`));
const log = (txt: string) => console.log(`[flakiness.io] ${txt}`);

export default class FlakinessReporter implements Reporter {
  private _vitest!: Vitest;
  private _startTimestamp: number = Date.now();
  private _tests = new Map<string, FK.Test>();
  private _allSuites = new Map<string, FK.Suite>();
  private _fileSuites = new Map<string, FK.Suite>();

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
    let commitId: FK.CommitId;
    let worktree: GitWorktree;
    try {
      worktree = GitWorktree.create(process.cwd());
      commitId = worktree.headCommitId()
    } catch (e) {
      warn(`Failed to fetch commit info - is this a git repo?`);
      err(`Report is NOT generated.`);
      return;
    }

    const environment = ReportUtils.createEnvironment({ name: 'default' });
    const duration = (Date.now() - this._startTimestamp) as FK.DurationMS;
    const report: FK.Report = ReportUtils.normalizeReport({
      category: 'vitest',
      commitId,
      environments: [environment],
      startTimestamp: this._startTimestamp as FK.UnixTimestampMS,
      duration,
      suites: Array.from(this._fileSuites.values()),
    });
    await ReportUtils.collectSources(worktree, report);

    const outputFolder = path.join(
      process.cwd(),
      process.env.FLAKINESS_OUTPUT_DIR ?? 'flakiness-report',
    );
    await writeReport(report, [], outputFolder);
  }
}
