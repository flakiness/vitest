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

it('should report failed test as failed', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('math should work', async (ctx) => {
        expect(1 + 1).toBe(3);
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
  expect(attempt.status ?? 'passed').toBe('failed');
  expect(attempt.expectedStatus ?? 'passed').toBe('passed');
  expect(attempt.duration ?? 0).toBeGreaterThan(0);
  expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
});


