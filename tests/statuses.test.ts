import { expect, it } from 'vitest';
import { assertCount, assertStatus, generateFlakinessReport } from './utils';

it('should report passed and failed tests', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('should work', async (ctx) => {
        expect(1 + 1).toBe(2);
      });

      it('should fail', async (ctx) => {
        expect(1 + 1).toBe(3);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertCount(report.suites, 1);
  expect(suite.title).toBe('sum.test.ts');

  const [passed, failed] = assertCount(suite.tests, 2);
  expect(passed.title).toBe('should work');
  expect(failed.title).toBe('should fail');

  {
    const [attempt] = assertCount(passed.attempts, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
    expect(attempt.duration ?? 0).toBeGreaterThan(0);
    expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
  }

  {
    const [attempt] = assertCount(failed.attempts, 1);
    expect(attempt.status ?? 'passed').toBe('failed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
    expect(attempt.duration ?? 0).toBeGreaterThan(0);
    expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
  }
});

it('should support test.skip', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it } from 'vitest';

      it.skip('skipped', async (ctx) => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertCount(report.suites, 1);
  const [skipped] = assertCount(suite.tests, 1);

  expect(skipped.title).toBe('skipped');
  const [attempt] = assertCount(skipped.attempts, 1);
  assertStatus(attempt.status, 'skipped');
  assertStatus(attempt.expectedStatus, 'skipped');
  expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
});

it('should support test.fails', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it } from 'vitest';

      it.fails('should fail', async (ctx) => {
        expect(1 + 1).toBe(3);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertCount(report.suites, 1);
  const [fails] = assertCount(suite.tests, 1);

  expect(fails.title).toBe('should fail');
  const [attempt] = assertCount(fails.attempts, 1);
  assertStatus(attempt.status, 'failed');
  assertStatus(attempt.expectedStatus, 'failed');
  expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
});

it('should support test.todo', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file.test.ts': `
      import { expect, it } from 'vitest';

      it.todo('todo this test', async (ctx) => {
        expect(1 + 1).toBe(3);
      });
    `
  });
  expect(report.category).toBe('vitest');
  const [suite] = assertCount(report.suites, 1);
  const [todo] = assertCount(suite.tests, 1);

  expect(todo.title).toBe('todo this test');
  const [attempt] = assertCount(todo.attempts, 1);
  assertStatus(attempt.status, 'skipped');
  assertStatus(attempt.expectedStatus, 'skipped');
});
