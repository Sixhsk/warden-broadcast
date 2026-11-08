import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://127.0.0.1:7317', ws: true },
      '/assets': { target: 'http://127.0.0.1:7317' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        console: resolve(__dirname, 'index.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
});