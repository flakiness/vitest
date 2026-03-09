import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should capture test annotations', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async ({ annotate }) => {
        await annotate('https://github.com/vitest-dev/vitest/pull/7953', 'issues');
      });
    `,
  });
  const [file1] = assertCount(report.suites, 1);
  const [test1] = assertCount(file1.tests, 1);
  const [attempt1] = assertCount(test1.attempts, 1);
  expect(attempt1.annotations).toEqual([{
    type: 'issues',
    description: 'https://github.com/vitest-dev/vitest/pull/7953',
    location: { file: 'file-1.test.ts', line: 5, column: 15 }
  }]);
});
