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
      });
    `,
  });
  const [file] = assertCount(report.suites, 1);
  const [test1] = assertCount(file.tests, 1);
  const [attempt] = assertCount(test1.attempts, 1);
  expect(attempt.stdio?.length).toBe(3);
  const [firstStdout, secondStdout, stderr] = assertCount(attempt.stdio, 3);
  expect((firstStdout as any).text).toBe('foo\n');
  expect(firstStdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);

  expect((secondStdout as any).text).toBe('baz\n');
  expect(secondStdout.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDOUT);
  expect((stderr as any).text).toBe('bar\n');
  expect(stderr.stream ?? FlakinessReport.STREAM_STDOUT).toBe(FlakinessReport.STREAM_STDERR);

  // Vitest versions before vitest-dev/vitest#10308 can emit the stale first
  // stdout timestamp for stderr here, after the newer second stdout event.
  // TimedSTDIOEntry.dts is a DurationMS, so it must never be negative.
  for (const entry of [firstStdout, secondStdout, stderr])
    expect(entry.dts).toBeGreaterThanOrEqual(0);
});
