import { expect, it } from 'vitest';
import { assertCount, assertStatus, generateFlakinessReport } from './utils';

it('should handle occasional "pending" result status', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    // The following combination results in the TestCases's result.state to be "pending"
    'file.test.ts': `
      import { expect, it, describe, afterAll } from 'vitest';

      it.only('foo', () => {});
      describe('bar', () => {
        describe.todo('baz', () => {
          it('test', () => {});
        });
      })
    `
  });
  expect(report.category).toBe('vitest');
  const [file] = assertCount(report.suites, 1);
  const [baSuite] = assertCount(file.suites, 1);
  const [bazSuite] = assertCount(baSuite.suites, 1);
  const [skipped] = assertCount(bazSuite.tests, 1);

  expect(skipped.title).toBe('test');
  const [attempt] = assertCount(skipped.attempts, 1);
  assertStatus(attempt.status, 'skipped');
  assertStatus(attempt.expectedStatus, 'skipped');
  expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
});
