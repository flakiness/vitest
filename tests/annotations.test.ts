import { expect, it } from 'vitest';
import { assertAttempts, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should capture test annotations', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async ({ annotate }) => {
        await annotate('https://github.com/vitest-dev/vitest/pull/7953', 'issues');
      });
    `,
  });
  const [file1] = assertSuites(report.suites, 1);
  const [test1] = assertTests(file1.tests, 1);
  const [attempt1] = assertAttempts(test1, 1);
  expect(attempt1.annotations).toEqual([{
    type: 'issues',
    description: 'https://github.com/vitest-dev/vitest/pull/7953',
    location: { file: 'file-1.test.ts', line: 5, column: 15 }
  }]);
});
