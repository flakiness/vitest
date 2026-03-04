import { expect, it } from 'vitest';
import { assertSuites, assertTests, generateFlakinessReport } from './utils';

// TODO: looks like custom reporters have no access to test tags.
it.todo('should capture test tags', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': `
      import { defineConfig } from 'vitest/config'

      export default defineConfig({
        test: {
          tags: [
            {
              name: 'smoke',
              description: 'smoke tests',
            }
          ]
        },
      });
    `,
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', { tags: ['smoke'] }, async () => {});
    `,
    'smoke.test.ts': `
      import { expect, it, describe } from 'vitest';
      /**
       * Smoke tests
       * @module-tag smoke
       */
      it('test-2', { tags: ['smoke'] }, async () => {});
    `,

  });
  const [file1, file2] = assertSuites(report.suites, 2);
  const [test1] = assertTests(file1.tests, 1);
  expect(test1.tags).toEqual(['smoke']);

  const [test2] = assertTests(file2.tests, 1);
  expect(test2.tags).toEqual(['smoke']);
});
