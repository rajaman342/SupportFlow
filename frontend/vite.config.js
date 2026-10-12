import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/health': 'http://localhost:4000',
      '/ready': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000'
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js']
  }
});
