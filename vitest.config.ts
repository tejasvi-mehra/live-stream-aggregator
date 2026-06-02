import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    env: {
      VITE_API_BASE: 'http://localhost:3002',
    },
  },
});
