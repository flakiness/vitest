import { expect, it } from 'vitest';
import { assertAttempts, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should handle retries', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'smoke.test.ts': `
      import { expect, it } from 'vitest';

      let attempt = 0;
      it('retryretry', { retry: 2 }, async (ctx) => {
        attempt++;
        await new Promise(x => setTimeout(x, 500));
        expect(attempt).toBeGreaterThan(2);
      });
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [test] = assertTests(suite.tests, 1);
  expect(test.title).toBe('retryretry');
  const [attempt1, attempt2, attempt3] = assertAttempts(test, 3);
  expect(attempt1.status ?? 'passed').toBe('failed');
  expect(attempt2.status ?? 'passed').toBe('failed');
  expect(attempt3.status ?? 'passed').toBe('passed');
});
