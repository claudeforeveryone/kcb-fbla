import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // '/' on Vercel; '/kcb-fbla/' when built for GitHub Pages
  base: process.env.PAGES_BASE || '/',
  plugins: [react(), tailwindcss()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
