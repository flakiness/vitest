import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

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
  const [suite] = assertCount(report.suites, 1);
  const [testWithRetries, testNoRetry] = assertCount(suite.tests, 2);
  expect(testWithRetries.title).toBe('retryretry');
  const [attempt1, attempt2, attempt3] = assertCount(testWithRetries.attempts, 3);
  expect(attempt1.status ?? 'passed').toBe('failed');
  expect(attempt2.status ?? 'passed').toBe('failed');
  expect(attempt3.status ?? 'passed').toBe('passed');

  assertCount(testNoRetry.attempts, 1);
});
