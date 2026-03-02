import type { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { GitWorktree, ReportUtils, writeReport } from '@flakiness/sdk';
import chalk from 'chalk';
import path from 'node:path';
import type { TestModule, Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

const warn = (txt: string) => console.warn(chalk.yellow(`[flakiness.io] ${txt}`));
const err = (txt: string) => console.error(chalk.red(`[flakiness.io] ${txt}`));
const log = (txt: string) => console.log(`[flakiness.io] ${txt}`);


export default class FlakinessReporter implements Reporter {
  private _vitest!: Vitest;
  private _startTimestamp: number = Date.now();

  onInit(vitest: Vitest) {
    this._vitest = vitest;
  }

  onTestRunStart() {
    this._startTimestamp = Date.now();      
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
      suites: [],
      tests: [],
    });
    await ReportUtils.collectSources(worktree, report);

    const outputFolder = path.join(
      process.cwd(),
      process.env.FLAKINESS_OUTPUT_DIR ?? 'flakiness-report',
    );
    await writeReport(report, [], outputFolder);
  }
}
