import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/uploads': target,
      '/share-target': target,
    },
  },
});
