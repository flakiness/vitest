import { ReportUtils } from '@flakiness/sdk';
import { expect, it } from 'vitest';
import { assertSuites, generateFlakinessReport } from './utils';

it('should property report hierarchy', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      describe('suite-1', () => {
        describe('suite-2', () => {
          describe('suite-3', () => {
            it('test-1', () => {});
            it('test-2', () => {});
          });
          describe('suite-4', () => {
            it('test-3', () => {});
          });
        });
      });
    `,

    'file-2.test.ts': `
      import { expect, it, describe } from 'vitest';

      describe('suite-6', () => {
        it('test-4', async (ctx) => { });
      });
    `,
  });
  const [file1, file2] = assertSuites(report.suites, 2);
  expect(file1.title).toBe('file-1.test.ts');
  expect(file2.title).toBe('file-2.test.ts');

  const titles: string[] = [];
  ReportUtils.visitTests(report, (test, parents) => {
    titles.push([...parents.map(p => p.title), test.title].join(' > '));
  });
  expect(titles).toEqual([
    'file-1.test.ts > suite-1 > suite-2 > suite-3 > test-1',
    'file-1.test.ts > suite-1 > suite-2 > suite-3 > test-2',
    'file-1.test.ts > suite-1 > suite-2 > suite-4 > test-3',
    'file-2.test.ts > suite-6 > test-4'
  ]);
});
