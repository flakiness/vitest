import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globalSetup: './tests/global-setup.ts',
    exclude: ['**/node_modules/**', '**/run-artifacts/**'],
    reporters: ['default', path.join(__dirname, './src/reporter.ts')],
  },
});
