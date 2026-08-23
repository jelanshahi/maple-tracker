import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'crs-rules', include: ['test/**/*.test.ts'] },
});
