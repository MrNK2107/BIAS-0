import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // VITE_PORT / API_PORT let e2e runs avoid ports other local servers hold.
    port: Number(process.env.VITE_PORT) || 5173,
    strictPort: !!process.env.VITE_PORT,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.API_PORT || 8000}`,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
    ],
  },
  build: {
    commonjsOptions: {
      include: [/firebase/, /node_modules/],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ['recharts'],
          vendor: ['react', 'react-dom', 'framer-motion'],
          firebase: ['firebase/app', 'firebase/auth'],
        },
      },
    },
    chunkSizeWarningLimit: 400,
  },
});
