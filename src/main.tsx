import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AppTree, ROUTER_BASENAME } from './AppTree';
import { mayHaveSession } from './lib/auth';

// Offline shell for installed and repeat visits (production only; never caches Supabase traffic).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

const container = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AppTree />
    </BrowserRouter>
  </StrictMode>
);

// Public pages (/, /login, /signup, /terms, /privacy) arrive prerendered as signed-out HTML. A signed-out visitor
// hydrates it in place, so there is no blank frame and a slow page chunk keeps the server HTML on screen. Anyone who
// may be signed in renders fresh instead (createRoot clears the prerendered markup on its first commit).
if (container.hasAttribute('data-prerendered') && !mayHaveSession()) hydrateRoot(container, tree);
else createRoot(container).render(tree);
