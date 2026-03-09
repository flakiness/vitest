import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

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

  const [suiteA, suiteB] = assertCount(report.suites, 2);

  assertCount(suiteA.tests, 1);
  assertCount(suiteB.tests, 1);
});
