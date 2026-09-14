import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy =
    (env.CAREER_UI_API_PROXY ||
      process.env.CAREER_UI_API_PROXY ||
      process.env.CAREER_REMOTE_WORLD_URL ||
      'http://127.0.0.1:8787')
      .trim()
      .replace(/\/+$/, '');

  return {
    plugins: [react()],
    root: '.',
    publicDir: 'public',
    server: {
      port: Number(process.env.CAREER_UI_PORT ?? 5173),
      proxy: {
        '/api': apiProxy,
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    optimizeDeps: {
      // MapLibre v6 ships a separate worker ESM; Vite's dep optimizer mishandles it.
      exclude: ['maplibre-gl'],
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  };
});
