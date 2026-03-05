import { expect, it } from 'vitest';
import { assertAttempts, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should capture multiple projects', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': `
      import { defineConfig } from 'vitest/config'

      export default defineConfig({
        test: {
          projects: [
            {
              test: {
                name: 'node',
              },
            },
            {
              test: {
                name: 'browser',
              },
            },
          ],
        },
      })
    `,
    'file.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test', async () => { });
    `,
  });
  const [file] = assertSuites(report.suites, 1);
  const [test] = assertTests(file.tests, 1);
  const [attempt1, attempt2] = assertAttempts(test, 2);
  expect(attempt1.environmentIdx ?? 0).not.toBe(attempt2.environmentIdx ?? 0);
  expect(report.environments.length).toBe(2);
  expect(report.environments.some(env => env.name === 'node')).toBeTruthy();
  expect(report.environments.some(env => env.name === 'browser')).toBeTruthy();
});

it.only('should have a reasonable name for default project', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it, describe } from 'vitest';
      it('test', async () => { });
    `,
  });
  expect(report.environments.length).toBe(1);
  // While the name is not the best, we can render it nicely in the UI later.
  expect(report.environments[0].name).toBe('');
});
