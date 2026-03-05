import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

/**
 * Since vitest allows duplicate test names,
 * and Flakiness.io doesn't, we need to make sure that reporter
 * renames duplicates.
 */
it('should rename duplicate test names', async (ctx) => {
  const { report, log } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('should work', async (ctx) => { });
      it('should work', async (ctx) => { });
      it('should work', async (ctx) => { });
    `
  });
  const [suite] = assertCount(report.suites, 1);
  const [test1, test2, test3] = assertCount(suite.tests, 3);
  expect(test1.title).toBe('should work');
  expect(test2.title).toBe('should work – dupe #2');
  expect(test3.title).toBe('should work – dupe #3');

  const warnMsg = assertCount(log.warns, 1);
  expect(warnMsg).toContain('3 duplicates detected');
  expect(warnMsg).toContain('sum.test.ts > should work');
});
