import { expect, it } from 'vitest';
import { assertAttachment, assertCount, attachmentNames, generateFlakinessReport, readAttachment } from './utils';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Browser Mode is the only thing in vitest that produces attachments on its
 * own, through two artifact types: `internal:toMatchScreenshot` (opt-in, on a
 * failed visual comparison) and `internal:failureScreenshot` (automatic, on
 * every failing test). These tests cover both.
 *
 * Requires `pnpm exec playwright install chromium`.
 */
const BROWSER_CONFIG = `
  import { playwright } from '@vitest/browser-playwright';
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        // Vitest defaults this to \`!browser.ui\`, so it is already on for these
        // runs - set it explicitly so the tests do not depend on that default.
        screenshotFailures: true,
        instances: [{
          browser: 'chromium',
          viewport: { width: 320, height: 240 },
        }],
      },
    },
  });
`;

it('should capture screenshots from toMatchScreenshot', async (ctx) => {
  const { report, attachments } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': BROWSER_CONFIG,
    'visual.test.ts': `
      import { page } from 'vitest/browser';
      import { expect, it } from 'vitest';

      it('visual test', async () => {
        document.body.innerHTML = '<div data-testid="target" style="width: 100px; height: 100px; background: red"></div>';
        const target = page.getByTestId('target');

        // Vitest only records a visual regression artifact for a FAILED
        // comparison. The first assertion creates the reference image and fails
        // because of that; catch it, change the element, then compare again to
        // produce a full expected/actual/diff triple.
        await expect.element(target).toMatchScreenshot('target').catch(() => {});
        document.querySelector<HTMLElement>('[data-testid="target"]')!.style.background = 'blue';
        await expect.element(target).toMatchScreenshot('target');
      });
    `,
  });

  const [file] = assertCount(report.suites, 1);
  const [test] = assertCount(file.tests, 1);
  const [attempt] = assertCount(test.attempts, 1);
  expect(attempt.status).toBe('failed');

  // The first comparison only produces a reference; the second produces all
  // three. No `failure-screenshot.png` here even though the test failed and
  // `screenshotFailures` is on: vitest suppresses the failure screenshot when
  // the failure came from `toMatchScreenshot`, since it would be redundant.
  expect(attachmentNames(attempt)).toEqual([
    'screenshot-1-expected.png',
    'screenshot-2-expected.png',
    'screenshot-2-actual.png',
    'screenshot-2-diff.png',
  ]);
  for (const name of attachmentNames(attempt)) {
    const attachment = assertAttachment(attempt, name, 'image/png');
    const content = await readAttachment(attachments, attachment);
    expect(content.subarray(0, PNG_MAGIC.length), `${name} should be a PNG`).toEqual(PNG_MAGIC);
  }

  // Both comparisons reference the very same file on disk, so it is stored once.
  const expectedIds = new Set([
    assertAttachment(attempt, 'screenshot-1-expected.png', 'image/png').id,
    assertAttachment(attempt, 'screenshot-2-expected.png', 'image/png').id,
  ]);
  expect(expectedIds.size).toBe(1);
});

it('should capture the failure screenshot of a failing test', async (ctx) => {
  const { report, attachments } = await generateFlakinessReport(ctx, {
    'vitest.config.ts': BROWSER_CONFIG,
    'failure.test.ts': `
      import { expect, it } from 'vitest';

      it('failing test', async () => {
        // Vitest skips the failure screenshot when the page has no height, so
        // give the body something to render before failing.
        document.body.innerHTML = '<div style="width: 100px; height: 100px; background: red"></div>';
        expect(1).toBe(2);
      });
    `,
  });

  const [file] = assertCount(report.suites, 1);
  const [test] = assertCount(file.tests, 1);
  const [attempt] = assertCount(test.attempts, 1);
  expect(attempt.status).toBe('failed');

  // An ordinary failing test needs no attachment API at all - Browser Mode
  // screenshots it automatically.
  expect(attachmentNames(attempt)).toEqual(['failure-screenshot.png']);
  const attachment = assertAttachment(attempt, 'failure-screenshot.png', 'image/png');
  const content = await readAttachment(attachments, attachment);
  expect(content.subarray(0, PNG_MAGIC.length), 'failure screenshot should be a PNG').toEqual(PNG_MAGIC);
});
