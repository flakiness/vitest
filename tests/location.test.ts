import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should report locations', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': `
      import { defineConfig } from 'vitest/config';
      export default defineConfig({
        test: {
          includeTaskLocation: true,
        },
      })
    `,
    'foo/file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      describe('suite-1', () => {
        it('test-1', () => {});
      });
    `,
  });
  const [file] = assertCount(report.suites, 1);
  const [suite1] = assertCount(file.suites, 1);
  const [test1] = assertCount(suite1.tests, 1);

  expect(file.location).toEqual({ file: 'foo/file-1.test.ts', column: 0, line: 0 });
  expect(suite1.location).toEqual({ file: 'foo/file-1.test.ts', column: 7, line: 4 });
  expect(test1.location).toEqual({ file: 'foo/file-1.test.ts', column: 9, line: 5 });
});
