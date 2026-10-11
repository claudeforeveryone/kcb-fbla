/**
 * Builds a PostgREST `or()` filter that prefix-matches usernames and substring-matches display names.
 * LIKE wildcards in the query are escaped (so `smoke_tester` matches literally) and each value is
 * double-quoted so commas or parentheses can't break out of the filter.
 */
export function profileSearchFilter(query: string): string | null {
  const q = query
    .trim()
    .replace(/^@/, '')
    .replace(/["*\\]/g, '');
  if (q.length < 2) return null;
  const like = (s: string) => s.replace(/[%_]/g, (c) => `\\${c}`);
  // Inside a quoted PostgREST value a backslash must itself be escaped.
  const quote = (s: string) => `"${s.replace(/\\/g, '\\\\')}"`;
  return `username.ilike.${quote(`${like(q.toLowerCase())}%`)},display_name.ilike.${quote(`%${like(q)}%`)}`;
}
