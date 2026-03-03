import { FlakinessReport } from '@flakiness/flakiness-report';
import { expect, it } from 'vitest';
import { generateFlakinessReport } from './utils';

function assertSuites(suites: FlakinessReport.Suite[]|undefined, length: number): FlakinessReport.Suite[] {
  expect(suites?.length ?? 0).toBe(length);
  return suites!;
}

function assertTests(suite: FlakinessReport.Suite, length: number): FlakinessReport.Test[] {
  expect(suite.tests?.length ?? 0).toBe(length);
  return suite.tests!;
}

function assertRootSuite(report: FlakinessReport.Report, idx: number): FlakinessReport.Suite {
  expect(report.suites?.length ?? 0, 'Failed to fetch suite from report').toBeGreaterThan(idx);
  return report.suites![idx];
}

function assertFirstTest(suite: FlakinessReport.Suite): FlakinessReport.Test {
  const test = suite.tests?.at(0);
  expect(test, `Failed to fetch first test from suite`).not.toBeUndefined();
  return test!;
}

it('should work', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('math should work', async (ctx) => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertSuites(report.suites, 1);
  expect(suite.title).toBe('sum.test.ts');

  const [test] = assertTests(suite, 1);
  expect(test.title).toBe('math should work');
  expect(test.attempts.length).toBe(1);
  const [attempt] = test.attempts;
  expect(attempt.status ?? 'passed').toBe('passed');
  expect(attempt.expectedStatus ?? 'passed').toBe('passed');
  expect(attempt.duration ?? 0).toBeGreaterThan(0);
  expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
});
