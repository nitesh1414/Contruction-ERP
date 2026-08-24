import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || env.VITE_API_URL || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5174,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5174,
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});
