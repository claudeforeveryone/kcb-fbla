/** Absolute URL to an in-app path, respecting the deploy base path (for auth email redirects). */
export function appUrl(path = '') {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/${path.replace(/^\//, '')}`;
}
