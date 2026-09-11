import { expect, it } from 'vitest';
import { assertCount, assertStatus, generateFlakinessReport } from './utils';

it('should NOT report repeats as test duplicates', async (ctx) => {
  const { report, log } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it } from 'vitest';

      // Keep it below 10 repeats: Vitest 4 adds an abort listener to the test's
      // signal on every run, and 11 of them trigger MaxListenersExceededWarning.
      it('should work', { repeats: 3 }, async (ctx) => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(log.warns.length).toBe(0);
  expect(log.errors.length).toBe(0);
  const [file] = assertCount(report.suites, 1);
  const [test] = assertCount(file.tests, 1);
  // Vitest does not give us per-repeat detalization,
  // and the `repeats` feature is anyway only used for debugging,
  // so we report it as a single attempt with the
  // matching status.
  const [attempt] = assertCount(test.attempts, 1);
  assertStatus(attempt.status, 'passed');
});
