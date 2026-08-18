import { FlakinessReport } from '@flakiness/flakiness-report';
import { expect, it } from 'vitest';
import { assertCount, generateFlakinessReport } from './utils';

it('should capture stdio', async (ctx) => {
  const { report } = await generateFlakinessReport(ctx, {
    'file-1.test.ts': `
      import { expect, it, describe } from 'vitest';

      it('test-1', async () => {
        await new Promise(x => setTimeout(x, 50));
        console.log('foo');
        await new Promise(x => setTimeout(x, 100));
        console.log('baz');
        await new Promise(x => setTimeout(x, 100));
        console.error('bar');
        await new Promise(x => setTimeout(x, 100));
        console.log('qux');
      });
    `,
  });
  const [file] = assertCount(report.suites, 1);
  const [test1] = assertCount(file.tests, 1);
  const [attempt] = assertCount(test1.attempts, 1);
  expect(attempt.stdio?.length).toBe(4);
  const [firstStdout, secondStdout, stderr, finalStdout] = assertCount(attempt.stdio, 4);
  expect((firstStdout as any).text).toBe('foo\n');
  expect(firstStdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);

  expect((secondStdout as any).text).toBe('baz\n');
  expect(secondStdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);
  expect((stderr as any).text).toBe('bar\n');
  expect(stderr.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDERR);
  expect((finalStdout as any).text).toBe('qux\n');
  expect(finalStdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);

  // Vitest versions before vitest-dev/vitest#10308 can emit the stale first
  // stdout timestamp for stderr here, after the newer second stdout event. A
  // stale entry must neither have a negative delta nor move the baseline back,
  // which would make the final stdout delta count the same interval twice.
  for (const entry of [firstStdout, secondStdout, stderr, finalStdout])
    expect(entry.dts).toBeGreaterThanOrEqual(0);
  expect(attempt.duration).toBeDefined();
  const stdioDuration = attempt.stdio.reduce((duration, entry) => duration + (entry.dts ?? 0), 0);
  // Console timestamps have integer-millisecond precision, whereas Vitest's
  // attempt duration is fractional. Allow only that small rounding difference.
  expect(stdioDuration).toBeLessThanOrEqual(attempt.duration! + 10);
});
