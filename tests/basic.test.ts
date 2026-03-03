import { expect, it } from 'vitest';
import { generateFlakinessReport } from './utils';

it('should work', async (ctx) => {
  const result = await generateFlakinessReport(ctx, {
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('yo', async (ctx) => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(result.report.category).toBe('vitest');
});
