import type { PerformanceMarkOptions } from 'node:perf_hooks';

declare module 'vitest/browser' {
  export interface MarkOptions extends PerformanceMarkOptions {}
}
