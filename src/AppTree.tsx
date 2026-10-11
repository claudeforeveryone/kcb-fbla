import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui/Toast';
import { RouteSeo } from './components/layout/RouteSeo';

/**
 * Everything under the router. The browser (main.tsx) and the build-time prerender (entry-server.tsx) both render
 * exactly this tree, so prerendered HTML hydrates without mismatches (useId values depend on the tree's shape).
 */
export function AppTree() {
  return (
    <ToastProvider>
      <AuthProvider>
        <RouteSeo />
        <App />
      </AuthProvider>
    </ToastProvider>
  );
}

/** Router basename: '/' on Vercel, '/kcb-fbla' when built for GitHub Pages. */
export const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';
