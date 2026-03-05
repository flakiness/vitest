import { expect, it } from 'vitest';
import { assertCount, assertStatus, generateFlakinessReport } from './utils';

/**
 * Since vitest allows duplicate test names,
 * and Flakiness.io doesn't, we need to make sure that reporter
 * handles the duplicates.
 */
it('should fail duplicate test names', async (ctx) => {
  const { report, log } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('should work', async (ctx) => { });
      it('should work', async (ctx) => { });
      it('should work', async (ctx) => { });
    `
  });
  const [suite] = assertCount(report.suites, 1);
  const [test1] = assertCount(suite.tests, 1);
  expect(test1.title).toBe('should work');
  const [attempt] = assertCount(test1.attempts, 1);
  assertStatus(attempt.status, 'failed');

  const [error] = assertCount(attempt.errors, 1);
  expect(error.message).toContain('3 tests');
  expect(error.message).toContain('sum.test.ts > should work');

  const [annotation] = assertCount(attempt.annotations, 1);
  expect(annotation.type).toBe('duplicates');
  expect(annotation.description).toContain('3 tests');
  expect(annotation.description).toContain('sum.test.ts > should work');

  const allWarns = log.warns.join('\n');
  expect(allWarns).toContain('3 tests');
  expect(allWarns).toContain('sum.test.ts > should work');
});
