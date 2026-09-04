import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {defineConfig, loadEnv} from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {version: string};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const singleBundle = process.env.VITE_SINGLE_BUNDLE === 'true';
  const allowedHosts = new Set<string>();
  for (const value of [env.MCP_PUBLIC_URL, ...(env.CORS_ORIGINS || '').split(',')]) {
    if (!value) continue;
    try { allowedHosts.add(new URL(value).hostname); } catch { /* ignore invalid optional URLs */ }
  }
  return {
    plugins: [react(), tailwindcss()],
    base: '/',
    define: {
      'global': 'window',
      'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    build: {
      chunkSizeWarningLimit: 10000,
      // Packaged Tauri keeps one bundle to avoid its Windows chunk-missing bug.
      rollupOptions: singleBundle ? {
        output: {
          manualChunks: () => 'app',
        },
      } : undefined,
    },
    server: {
      port: 5173,
      allowedHosts: [...allowedHosts],
      proxy: {
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
