import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const proxy = { '/api': { target: 'http://127.0.0.1:5174' } };
function revampStudioV3(): Plugin {
  return {
    name: 'revamp-studio-v3-static',
    closeBundle() {
      const destination = resolve('dist/revamp-studio');
      mkdirSync(destination, { recursive: true });
      copyFileSync(resolve('revamp-studio/index.html'), resolve(destination, 'index.html'));
    },
  };
}
export default defineConfig({
  plugins: [react(), revampStudioV3()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', proxy },
});
