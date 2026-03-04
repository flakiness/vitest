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

      it('noretry', async () => { });
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [testWithRetries, testNoRetry] = assertTests(suite.tests, 2);
  expect(testWithRetries.title).toBe('retryretry');
  const [attempt1, attempt2, attempt3] = assertAttempts(testWithRetries, 3);
  expect(attempt1.status ?? 'passed').toBe('failed');
  expect(attempt2.status ?? 'passed').toBe('failed');
  expect(attempt3.status ?? 'passed').toBe('passed');

  assertAttempts(testNoRetry, 1);
});
