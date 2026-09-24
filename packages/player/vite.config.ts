import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
export default defineConfig({
  plugins: [
    {
      name: 'distribution-notices',
      async generateBundle() {
        for (const [fileName, source] of [
          ['LICENSE', '../../LICENSE'],
          ['CONTENT_LICENSE.md', '../../CONTENT_LICENSE.md'],
          ['LICENSE-CC0.txt', '../../LICENSE-CC0.txt'],
          ['THIRD_PARTY_NOTICES.md', '../../THIRD_PARTY_NOTICES.md'],
          ['INK_BATTLE_LICENSE.txt', '../ink-battle/LICENSE'],
          ['INK_BATTLE_NOTICE.txt', '../ink-battle/NOTICE'],
          ['INK_BATTLE_PROVENANCE.json', '../ink-battle/PROVENANCE.json'],
        ])
          this.emitFile({
            type: 'asset',
            fileName,
            source: await readFile(new URL(source, import.meta.url), 'utf8'),
          });
      },
    },
  ],
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 750,
    rollupOptions: { input: { main: 'index.html', text: 'text.html' } },
  },
  server: { port: 5173, strictPort: true },
});
