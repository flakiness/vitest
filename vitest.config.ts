import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', './src/reporter.ts'],
  },
});
