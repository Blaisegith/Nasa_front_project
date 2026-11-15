import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuration Vite.
 *
 * - plugin React : rafraîchissement rapide en développement ;
 * - proxy `/api` : le navigateur n'appelle jamais directement le backend en
 *   développement, ce qui reproduit l'architecture de production (même origine).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
  },
});