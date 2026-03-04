import { expect, it } from 'vitest';
import { assertAttempts, assertStatus, assertSuites, assertTests, generateFlakinessReport } from './utils';

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
  const [suite] = assertSuites(report.suites, 1);
  expect(suite.title).toBe('sum.test.ts');

  const [passed, failed] = assertTests(suite.tests, 2);
  expect(passed.title).toBe('should work');
  expect(failed.title).toBe('should fail');

  {
    const [attempt] = assertAttempts(passed, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
    expect(attempt.duration ?? 0).toBeGreaterThan(0);
    expect(attempt.startTimestamp ?? 0).toBeGreaterThan(0);
  }

  {
    const [attempt] = assertAttempts(failed, 1);
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
  const [suite] = assertSuites(report.suites, 1);
  const [skipped] = assertTests(suite.tests, 1);

  expect(skipped.title).toBe('skipped');
  const [attempt] = assertAttempts(skipped, 1);
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
  const [suite] = assertSuites(report.suites, 1);
  const [fails] = assertTests(suite.tests, 1);

  expect(fails.title).toBe('should fail');
  const [attempt] = assertAttempts(fails, 1);
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
  const [suite] = assertSuites(report.suites, 1);
  const [todo] = assertTests(suite.tests, 1);

  expect(todo.title).toBe('todo this test');
  const [attempt] = assertAttempts(todo, 1);
  assertStatus(attempt.status, 'skipped');
  assertStatus(attempt.expectedStatus, 'skipped');
});
