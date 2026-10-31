import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The browser only talks to this dev server; /api is forwarded to the Express backend.
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', include: ['test/**/*.test.tsx'] },
  server: {
    port: 5173,
    // the job form reads the list of operations from the server's own definition
    fs: { allow: ['..'] },
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:3000',
    },
  },
});
