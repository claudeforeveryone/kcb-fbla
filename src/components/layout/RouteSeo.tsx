import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { applyDocumentMeta } from '../../lib/seo';

/** Keeps the document title and search tags in step with the current route. Renders nothing. */
export function RouteSeo() {
  const { pathname } = useLocation();
  const { session, loading } = useAuth();
  // Signed in, or a stored session still being checked: "/" is their dashboard, not the public home page.
  const member = loading || !!session;
  const firstLoad = useRef(true);
  useEffect(() => {
    applyDocumentMeta(pathname, { member, firstLoad: firstLoad.current });
    firstLoad.current = false;
  }, [pathname, member]);
  return null;
}
