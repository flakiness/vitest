import { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { GitWorktree, ReportUtils, uploadReport, writeReport } from '@flakiness/sdk';
import chalk from 'chalk';
import assert from 'node:assert';
import path from 'node:path';
import type { TestCase, TestModule, TestSuite, Vitest } from 'vitest/node';
import type { Reporter } from 'vitest/reporters';

const warn = (txt: string) => console.warn(chalk.yellow(`[flakiness.io] ${txt}`));
const err = (txt: string) => console.error(chalk.red(`[flakiness.io] ${txt}`));
const log = (txt: string) => console.log(`[flakiness.io] ${txt}`);

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
interface TestArtifactLocation {
	/** Line number in the source file (1-indexed) */
	line: number;
	/** Column number in the line (1-indexed) */
	column: number;
	/** Path to the source file */
	file: string;
}
interface TestAttachment {
	/** MIME type of the attachment (e.g., 'image/png', 'text/plain') */
	contentType?: string;
	/** File system path to the attachment */
	path?: string;
	/** Inline attachment content as a string or raw binary data */
	body?: string | Uint8Array;
}
interface TestAnnotation {
	message: string;
	type: string;
	location?: TestArtifactLocation;
	attachment?: TestAttachment;
}


export default class FKVitestReporter implements Reporter {
  private _impl?: ReporterImpl;

  constructor(private _options: ReportOptions) {
  }

  onUserConsoleLog(log: UserConsoleLog) {
    this._impl?.onUserConsoleLog(log);
  }

  onInit(vitest: Vitest) {
    this._impl = ReporterImpl.create(vitest.config.root, this._options);
    this._impl?.onInit(vitest);
  }

	/**
	* Called when annotation is added via the `task.annotate` API.
	*/
	onTestCaseAnnotate(testCase: TestCase, annotation: TestAnnotation) {
    this._impl?.onTestCaseAnnotate(testCase, annotation);
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
  private _stdio = new Map<string, UserConsoleLog[]>();
  private _annotations = new Map<string, TestAnnotation[]>();

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

  onTestCaseAnnotate(testCase: TestCase, annotation: TestAnnotation) {
    let entries = this._annotations.get(testCase.id);
    if (!entries) {
      entries = [];
      this._annotations.set(testCase.id, entries);
    }
    entries.push(annotation);
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
        location: p.location ? {
          file: this._worktree.gitPath(p.module.moduleId),
          column: p.location.column as FK.Number1Based,
          line: p.location.line as FK.Number1Based,
        } : undefined,
      };
      parent.suites ??= [];
      parent.suites.push(suite);
    } else {
      suite = {
        type: 'file',
        title: p.relativeModuleId,
        location: {
          file: this._worktree.gitPath(p.moduleId),
          column: 0 as FK.Number1Based,
          line: 0 as FK.Number1Based,
        },
      };
      this._fileSuites.set(p.id, suite);
    }
    this._allSuites.set(p.id, suite);
    return suite;
  }

  private _ensureTest(testCase: TestCase): FK.Test {
    let fkTest = this._tests.get(testCase.id);
    if (!fkTest) {
      fkTest = {
        attempts: [],
        title: testCase.name,
        location: testCase.location ? {
          file: this._worktree.gitPath(testCase.module.moduleId),
          column: testCase.location.column as FK.Number1Based,
          line: testCase.location.line as FK.Number1Based,
        } : undefined,
      }
      this._tests.set(testCase.id, fkTest);
      const parent = this._ensureFKSuite(testCase.parent);
      parent.tests ??= [];
      parent.tests.push(fkTest);
    }
    return fkTest;
  }

  async onTestCaseResult(testCase: TestCase) {
    const fkTest = this._ensureTest(testCase);
    const diag = testCase.diagnostic();
    assert(diag, `Diagnostic must be present in finished test cases`);;

    const result = testCase.result();

    const stdio: FK.TimedSTDIOEntry[] = [];
    let ts = diag.startTime;
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
    const errors: FK.ReportError[] = (result.errors ?? []).map(error => {
      // Find a frame that is either in the test file, or the first outside of node_modules.
      const frame = error.stacks?.find(frame => this._worktree.gitPath(frame.file) === testFile) ??
        error.stacks?.find(frame => !frame.file.includes('node_modules'));
      return {
        message: error.message,
        stack: error.stack,
        location: frame ? {
          file: this._worktree.gitPath(frame.file),
          line: frame.line as FK.Number1Based,
          column: frame.column as FK.Number1Based,
        } : undefined,
      }
    });

    const annotations: FK.Annotation[] = (this._annotations.get(testCase.id) ?? []).map(annotation => ({
      type: annotation.type,
      description: annotation.message,
      location: annotation.location ? {
        file: this._worktree.gitPath(annotation.location.file),
        line: annotation.location.line as FK.Number1Based,
        column: annotation.location.column as FK.Number1Based,
      } : undefined,
    }));

    // Vitest DOES NOT give us per-retry detalization, so we have
    // to synthesize it here.
    // We will do it like this:
    // - we will have X retries, all with status "failed" and duration = 0
    // - the last retry will be "passed"
    for (let i = 0; i < diag.retryCount; ++i) {
      fkTest.attempts.push({
        startTimestamp: diag.startTime as FK.UnixTimestampMS,
        duration: 0 as FK.DurationMS,
        status: 'failed',
        // TODO: ideally, we can differentiate STDIO between attempts.
        // However, vitest doesn't let us do so easily.
        stdio,
        errors,
        annotations,
      });
    }

    fkTest.attempts.push({
      startTimestamp: diag.startTime as FK.UnixTimestampMS,
      duration: diag.duration as FK.DurationMS,
      status: result.state === 'failed' ? 'failed' : 
        result.state === 'skipped' ? 'skipped' : 
        'passed',
      // TODO: ideally, we can differentiate STDIO between attempts.
      // However, vitest doesn't let us do so easily.
      stdio,
      errors,
      annotations
    });
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const environment = ReportUtils.createEnvironment({ name: 'default' });
    const duration = (Date.now() - this._startTimestamp) as FK.DurationMS;
    const report: FK.Report = ReportUtils.normalizeReport({
      flakinessProject: this._options.flakinessProject,
      category: 'vitest',
      commitId: this._commitId,
      environments: [environment],
      startTimestamp: this._startTimestamp as FK.UnixTimestampMS,
      duration,
      suites: Array.from(this._fileSuites.values()),
    });
    await ReportUtils.collectSources(this._worktree, report);
    const outputFolder = this._options.outputFolder ?? path.join(
      process.cwd(),
      process.env.FLAKINESS_OUTPUT_DIR ?? 'flakiness-report',
    );
    await writeReport(report, [], outputFolder);

    if (!process.env.FLAKINESS_DISABLE_UPLOAD)
      await uploadReport(report, []);
  }
}
