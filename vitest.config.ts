import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    includeTaskLocation: true,
    globalSetup: './tests/global-setup.ts',
    exclude: ['**/node_modules/**', '**/run-artifacts/**'],
    testTimeout: 30000,
    reporters: [
      ['default'],
      ['@flakiness/vitest', {
        flakinessProject: 'flakiness/vitest',
      }],
    ],
  },
});
