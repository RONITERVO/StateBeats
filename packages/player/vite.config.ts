import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 750,
    rollupOptions: { input: { main: 'index.html', text: 'text.html' } },
  },
  server: { port: 5173, strictPort: true },
});
