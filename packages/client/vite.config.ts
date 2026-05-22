import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@skak/shared': sharedSrc,
    },
  },
  optimizeDeps: {
    exclude: ['@skak/shared'],
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..', '../..'],
    },
  },
});
