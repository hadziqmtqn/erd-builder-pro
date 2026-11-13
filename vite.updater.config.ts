import {defineConfig} from 'vite';

// The Desktop updater window (OPS-009) is its own small bundle next to the app's in dist/,
// so it still opens when the app bundle or the local server cannot start.
export default defineConfig({
  // public/ is already copied by the app build.
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {input: 'updater.html'},
  },
});
