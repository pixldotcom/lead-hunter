import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const proxy = { '/api': { target: 'http://127.0.0.1:5174' } };
export default defineConfig({ plugins: [react()], server: { host: '127.0.0.1', proxy }, preview: { host: '127.0.0.1', proxy } });
