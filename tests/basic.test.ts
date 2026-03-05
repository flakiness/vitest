import { expect, it } from 'vitest';
import { generateFlakinessReport } from './utils';

it('should report proper top-level properties', async (ctx) => {
  const starttime = Date.now();
  const { report } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': `
      import { defineConfig } from 'vitest/config';
      export default defineConfig({});
    `,
    'sum.test.ts': `
      import { expect, it } from 'vitest';

      it('should work', async (ctx) => {
        expect(1 + 1).toBe(2);
        await new Promise(x => setTimeout(x, 50));
      });
    `
  }, {
    flakinessProject: 'foo/bar',
  });
  expect(report.category).toBe('vitest');
  expect(report.flakinessProject).toBe('foo/bar');
  expect(report.commitId).not.toBeUndefined();
  expect(report.configPath).toBe('vitest.config.ts');
  expect(report.duration).toBeGreaterThan(50);
  expect(report.startTimestamp).toBeGreaterThanOrEqual(starttime);
  // CPU telemetry
  expect(report.cpuCount).toBeGreaterThan(0);
  expect(report.cpuMax?.length).toBeGreaterThan(0);
  expect(report.cpuAvg?.length).toBeGreaterThan(0);
  // RAM telemetry
  expect(report.ramBytes).toBeGreaterThan(0);
  expect(report.ram?.length).toBeGreaterThan(0);
});
