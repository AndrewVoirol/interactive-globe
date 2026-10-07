import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mountWorktreeAssets } from './scripts/mount-worktree-assets';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'worktree-asset-guard',
      configureServer(server) {
        try {
          mountWorktreeAssets(import.meta.dirname);
        } catch {}

        server.middlewares.use((req, res, next) => {
          const rawUrl = req.url?.split('?')[0] || '';
          if (rawUrl.endsWith('.bin')) {
            const publicPath = path.join(import.meta.dirname, 'public', rawUrl.replace(/^\//, ''));
            if (!fs.existsSync(publicPath)) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'text/plain');
              res.end(`Binary asset not found: ${rawUrl}`);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'lucide-vendor';
          }
          if (id.includes('src/components/hud')) {
            return 'hud-components';
          }
        }
      }
    }
  }
});
