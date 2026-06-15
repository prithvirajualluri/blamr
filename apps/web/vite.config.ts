import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@blamr/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
  server: {
    port: 8080,
    host: true,
    // Operator console lives at /app (pathname); fall back to SPA entry.
    historyApiFallback: { index: '/index.html' },
  },
  build: {
    outDir: 'dist',
  },
});
