import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@blamr/types': path.resolve(
        __dirname,
        command === 'build' ? '../../packages/types/dist' : '../../packages/types/src',
      ),
    },
  },
  server: {
    port: 8080,
    host: true,
    historyApiFallback: { index: '/index.html' },
  },
  build: {
    outDir: 'dist',
    commonjsOptions: {
      include: [/packages\/types\/dist/, /node_modules/],
      transformMixedEsModules: true,
    },
  },
}));
