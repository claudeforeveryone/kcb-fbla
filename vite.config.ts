import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // '/' on Vercel; '/kcb-fbla/' when built for GitHub Pages
  base: process.env.PAGES_BASE || '/',
  plugins: [react(), tailwindcss()],
  // The footer's copyright year in prerendered HTML (src/lib/hydration.ts). The client and the prerender's server
  // build both read it, so hydration matches.
  define: { __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()) },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
