import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { youtubeApiPlugin } from './plugins/youtubeApi';

export default defineConfig({
  server: {
    port: 3001,
    host: '0.0.0.0',
  },
  plugins: [react(), youtubeApiPlugin()],
});
