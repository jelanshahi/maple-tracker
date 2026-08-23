import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'ingester', include: ['test/**/*.test.ts'] },
});
