import { FlakinessReport } from '@flakiness/flakiness-report';
import { expect, it } from 'vitest';
import { assertAttempts, assertSTDIO, assertSuites, assertTests, generateFlakinessReport } from './utils';

it('should capture stdio', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async () => {
        await new Promise(x => setTimeout(x, 50));
        console.log('foo');
        await new Promise(x => setTimeout(x, 100));
        console.error('bar');
      });
    `,
  });
  const [file] = assertSuites(report.suites, 1);
  const [test1] = assertTests(file.tests, 1);
  const [attempt] = assertAttempts(test1, 1);
  expect(attempt.stdio?.length).toBe(2);
  const [stdout, stderr] = assertSTDIO(attempt.stdio, 2);
  expect((stdout as any).text).toBe('foo\n');
  expect(stdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);

  expect((stderr as any).text).toBe('bar\n');
  expect(stderr.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDERR);
  //TODO: vitest bug: the first stderr entry has the same time
  // as the previous stdout.
  // expect(stderr.dts).toBeGreaterThan(0);
});
