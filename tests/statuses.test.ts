import { expect, it } from 'vitest';
import { assertAttempts, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should report passed and failed statuses', async (ctx) => {
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

it('should report skipped tests with it.skip', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'skip.test.ts': `
      import { expect, it } from 'vitest';

      it('should run', () => {
        expect(1).toBe(1);
      });

      it.skip('should be skipped', () => {
        expect(1).toBe(2);
      });
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [ran, skipped] = assertTests(suite.tests, 2);

  expect(ran.title).toBe('should run');
  {
    const [attempt] = assertAttempts(ran, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
  }

  expect(skipped.title).toBe('should be skipped');
  {
    const [attempt] = assertAttempts(skipped, 1);
    expect(attempt.status).toBe('skipped');
  }
});

it('should report todo tests with it.todo', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'todo.test.ts': `
      import { expect, it } from 'vitest';

      it('should run', () => {
        expect(1).toBe(1);
      });

      it.todo('should be implemented later');
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [ran, todo] = assertTests(suite.tests, 2);

  expect(ran.title).toBe('should run');
  {
    const [attempt] = assertAttempts(ran, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
  }

  expect(todo.title).toBe('should be implemented later');
  {
    const [attempt] = assertAttempts(todo, 1);
    expect(attempt.status).toBe('skipped');
  }
});

it('should report tests marked with it.fails', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'fails.test.ts': `
      import { expect, it } from 'vitest';

      it('should pass normally', () => {
        expect(1).toBe(1);
      });

      it.fails('should be expected to fail', () => {
        expect(1).toBe(2);
      });
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [passed, fails] = assertTests(suite.tests, 2);

  expect(passed.title).toBe('should pass normally');
  {
    const [attempt] = assertAttempts(passed, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus ?? 'passed').toBe('passed');
  }

  expect(fails.title).toBe('should be expected to fail');
  {
    const [attempt] = assertAttempts(fails, 1);
    // it.fails tests that actually fail are reported as passed by vitest
    // (since failing is the expected behavior), with expectedStatus = 'failed'
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus).toBe('failed');
  }
});

it('should report skipped tests inside describe.skip', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'describe-skip.test.ts': `
      import { expect, it, describe } from 'vitest';

      describe.skip('skipped suite', () => {
        it('test inside skipped describe', () => {
          expect(1).toBe(1);
        });

        it('another test inside skipped describe', () => {
          expect(2).toBe(2);
        });
      });

      it('test outside skipped describe', () => {
        expect(3).toBe(3);
      });
    `
  });
  const [fileSuite] = assertSuites(report.suites, 1);

  // The test outside the skipped describe should pass
  const [outsideTest] = assertTests(fileSuite.tests, 1);
  expect(outsideTest.title).toBe('test outside skipped describe');
  {
    const [attempt] = assertAttempts(outsideTest, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
  }

  // Tests inside describe.skip should be skipped
  const [skippedSuite] = assertSuites(fileSuite.suites, 1);
  expect(skippedSuite.title).toBe('skipped suite');
  const [skipped1, skipped2] = assertTests(skippedSuite.tests, 2);

  expect(skipped1.title).toBe('test inside skipped describe');
  {
    const [attempt] = assertAttempts(skipped1, 1);
    expect(attempt.status).toBe('skipped');
  }

  expect(skipped2.title).toBe('another test inside skipped describe');
  {
    const [attempt] = assertAttempts(skipped2, 1);
    expect(attempt.status).toBe('skipped');
  }
});

it('should report todo tests inside describe.todo', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'describe-todo.test.ts': `
      import { expect, it, describe } from 'vitest';

      describe.todo('todo suite', () => {
        it('test inside todo describe', () => {
          expect(1).toBe(1);
        });
      });

      it('test outside todo describe', () => {
        expect(1).toBe(1);
      });
    `
  });
  const [fileSuite] = assertSuites(report.suites, 1);

  const [outsideTest] = assertTests(fileSuite.tests, 1);
  expect(outsideTest.title).toBe('test outside todo describe');
  {
    const [attempt] = assertAttempts(outsideTest, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
  }

  const [todoSuite] = assertSuites(fileSuite.suites, 1);
  expect(todoSuite.title).toBe('todo suite');
  const [todoTest] = assertTests(todoSuite.tests, 1);
  expect(todoTest.title).toBe('test inside todo describe');
  {
    const [attempt] = assertAttempts(todoTest, 1);
    expect(attempt.status).toBe('skipped');
  }
});

it('should report mixed statuses in a single file', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'mixed.test.ts': `
      import { expect, it } from 'vitest';

      it('passes', () => {
        expect(true).toBe(true);
      });

      it.skip('is skipped', () => {
        expect(true).toBe(false);
      });

      it.todo('is todo');

      it('fails', () => {
        expect(true).toBe(false);
      });

      it.fails('expected to fail', () => {
        throw new Error('intentional');
      });
    `
  });
  const [suite] = assertSuites(report.suites, 1);
  const [passes, skipped, todo, fails, expectedFail] = assertTests(suite.tests, 5);

  expect(passes.title).toBe('passes');
  expect(assertAttempts(passes, 1)[0].status ?? 'passed').toBe('passed');

  expect(skipped.title).toBe('is skipped');
  expect(assertAttempts(skipped, 1)[0].status).toBe('skipped');

  expect(todo.title).toBe('is todo');
  expect(assertAttempts(todo, 1)[0].status).toBe('skipped');

  expect(fails.title).toBe('fails');
  expect(assertAttempts(fails, 1)[0].status).toBe('failed');

  expect(expectedFail.title).toBe('expected to fail');
  {
    const [attempt] = assertAttempts(expectedFail, 1);
    expect(attempt.status ?? 'passed').toBe('passed');
    expect(attempt.expectedStatus).toBe('failed');
  }
});
