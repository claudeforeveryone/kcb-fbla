import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyDocumentMeta } from '../../lib/seo';

/** Keeps the document title and search tags in step with the current route. Renders nothing. */
export function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => applyDocumentMeta(pathname), [pathname]);
  return null;
}
