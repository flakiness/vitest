import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should report parallelIndex when vitest exposes concurrencyId', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'worker1.test.ts': `
      import { it } from 'vitest';

      it('worker1', async () => { });
    `,
    'worker2.test.ts': `
      import { it } from 'vitest';

      it('worker2', async () => { });
    `,
  },
  undefined,
  true,
);
  const worker1Suite = report.suites.find(suite => suite.title === 'worker1.test.ts');
  expect(worker1Suite).toBeDefined();
  const [worker1Test] = assertCount(worker1Suite!.tests, 1);
  expect(worker1Test.title).toBe('worker1');
  const [worker1Attempt] = assertCount(worker1Test.attempts, 1);
  expect([1, undefined]).toContain(worker1Attempt.parallelIndex);

  const worker2Suite = report.suites.find(suite => suite.title === 'worker2.test.ts');
  expect(worker2Suite).toBeDefined();
  const [worker2Test] = assertCount(worker2Suite!.tests, 1);
  expect(worker2Test.title).toBe('worker2');
  const [worker2Attempt] = assertCount(worker2Test.attempts, 1);
  expect([2, undefined]).toContain(worker2Attempt.parallelIndex);
});
