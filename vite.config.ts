import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const API_PORT = process.env.API_PORT ?? '8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Peel stable, heavy libs into their own chunks: `react` is cached
        // across deploys; `katex` rides along only with the lazy Markdown
        // chunk and downloads in parallel with it.
        manualChunks(id) {
          if (id.includes('node_modules/katex')) return 'katex';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return 'react';
        },
      },
    },
    // The Markdown chunk (KaTeX + highlight.js + remark/rehype) is loaded on
    // demand, so its size doesn't gate first paint — don't warn about it.
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
