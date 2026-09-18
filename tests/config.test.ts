import { expect, it } from 'vitest';
import { generateFlakinessReport } from './utils';

const TEST_FILES = {
  'sum.test.ts': `
    import { expect, it } from 'vitest';

    it('should work', () => {
      expect(1 + 1).toBe(2);
    });
  `,
};

it('should report auto-detected config', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, TEST_FILES);
  expect(report.configPath).toBe('vitest.config.ts');
});

it('should report config passed explicitly', async (ctx) => {
  // The project also has the default `vitest.config.ts`, which Vitest must not
  // pick up. The path is relative to the root, as in `--config`.
  const { report } = await generateFlakinessReport(ctx, {
    ...TEST_FILES,
    'configs/vitest.custom.config.ts': `
      import { defineConfig } from 'vitest/config';
      export default defineConfig({});
    `,
  }, undefined, { config: 'configs/vitest.custom.config.ts' });
  expect(report.configPath).toBe('configs/vitest.custom.config.ts');
});

it('should not report config when it is disabled', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, TEST_FILES, undefined, { config: false });
  expect(report.configPath).toBeUndefined();
});
