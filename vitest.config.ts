import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    env: {
      VITE_API_BASE: 'http://localhost:3002',
      // Keep catalog tests on the default GitHub raw URL even when .env points elsewhere.
      VITE_CATALOG_URL: '',
    },
  },
});
