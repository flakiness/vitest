import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should capture test annotations', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async ({ annotate }) => {
        await annotate('https://github.com/vitest-dev/vitest/pull/7953', 'issues');
        await annotate('debug log', {
          body: 'annotation text',
          bodyEncoding: 'utf-8',
          contentType: 'text/plain',
        });
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
  }, {
    type: 'notice',
    description: 'debug log',
    location: { file: 'file-1.test.ts', line: 6, column: 15 }
  }]);
  // An annotation with an attachment still produces the annotation itself, but
  // its attachment is deliberately not collected: vitest 4 does not report
  // annotations as artifacts, and the API sees no real-world use.
  expect(attempt1.attachments ?? []).toEqual([]);
});
