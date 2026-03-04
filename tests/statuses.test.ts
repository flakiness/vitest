import { expect, it } from 'vitest';
import { assertAttempts, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should report statuses', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('should work', async (ctx) => {
        expect(1 + 1).toBe(2);
      });

      it('should fail', async (ctx) => {
        expect(1 + 1).toBe(3);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertSuites(report.suites, 1);
  expect(suite.title).toBe('sum.test.ts');

  const [passed, failed] = assertTests(suite, 2);
  expect(passed.title).toBe('should work');
  expect(failed.title).toBe('should fail');

  {
    const [attempt] = assertAttempts(passed, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
    expect(attempt.duration ?? 0).toBeGreaterThan(0);
    expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
  }

  {
    const [attempt] = assertAttempts(failed, 1);
    expect(attempt.status ?? 'passed').toBe('failed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
    expect(attempt.duration ?? 0).toBeGreaterThan(0);
    expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
  }
});
