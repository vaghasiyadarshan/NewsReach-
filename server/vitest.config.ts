import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    globalSetup: ['test/fixtures/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
});
