import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    exclude: ['**/node_modules/**', '**/run-artifacts/**'],
    reporters: ['default', path.join(__dirname, './src/reporter.ts')],
    testTimeout: 30000,
  },
});
