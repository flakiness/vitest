import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should capture test errors', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async () => {
        expect(1).toBe(2);
      });
    `,
  });
  assertCount(report.unattributedErrors, 0);
  const [file] = assertCount(report.suites, 1);
  const [test1] = assertCount(file.tests, 1);
  const [attempt] = assertCount(test1.attempts, 1);
  const [error] = assertCount(attempt.errors, 1);
  expect(error.message).toContain('expected 1 to be 2');
  expect(error.location).toEqual({
    line: 5,
    column: 19,
    file: 'file-1.test.ts',
  });
});

it('should capture unhandled errors', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test', async () => {
        setTimeout(() => {
          throw new Error('Unhinged error!');
        }, 10);
      });

      it.afterAll(async () => {
        await new Promise(x => setTimeout(x, 100));
      })
    `,
  });
  expect(report.unattributedErrors?.length).toBe(1);
  assertCount(report.environments, 1);
  const err = report.unattributedErrors![0];
  expect(err.message).toBe('Unhinged error!');
});

it('should generate report when tests have syntax errors', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import (){{ expect, it, describe from 'vitest';
    `,
  });
  expect(report.unattributedErrors?.length).toBe(1);
  assertCount(report.environments, 1);
});
