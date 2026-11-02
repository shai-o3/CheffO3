import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  // The demo is packed into a single page, so keep it to one JS file.
  build: process.env.VITE_DEMO === '1' ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  server: {
    proxy: {
      '/api': target,
      '/uploads': target,
      '/share-target': target,
    },
  },
});
