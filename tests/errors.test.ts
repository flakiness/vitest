import { expect, it } from 'vitest';
import { assertAttempts, assertErrors, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should capture test errors', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async () => {
        expect(1).toBe(2);
      });
    `,
  });
  const [file] = assertSuites(report.suites, 1);
  const [test1] = assertTests(file.tests, 1);
  const [attempt] = assertAttempts(test1, 1);
  const [error] = assertErrors(attempt.errors, 1);
  expect(error.message).toContain('expected 1 to be 2');
  expect(error.location).toEqual({
    line: 5,
    column: 19,
    file: 'file-1.test.ts',
  });
});
