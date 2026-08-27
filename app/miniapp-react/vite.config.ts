import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/miniapp/static/',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
    proxy: {
      '/miniapp/api': 'http://127.0.0.1:8080',
      '/miniapp/assets': 'http://127.0.0.1:8080',
    },
  },
  build: {
    outDir: resolve(__dirname, '../miniapp/static'),
    emptyOutDir: false,
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          twa: ['@twa-dev/sdk'],
          lucide: ['lucide-react'],
        },
      },
    },
  },
});
