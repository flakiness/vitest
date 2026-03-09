import { expect, it } from 'vitest';
import { assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should report tests from shared fixtures imported by multiple spec files', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'fixtures.ts': `
      import { it } from 'vitest';

      it('shared test', () => {});
    `,
    'a.spec.ts': `
      import './fixtures';
    `,
    'b.spec.ts': `
      import './fixtures';
    `,
  });

  const [suiteA, suiteB] = assertSuites(report.suites, 2);

  assertTests(suiteA.tests, 1);
  assertTests(suiteB.tests, 1);
});
