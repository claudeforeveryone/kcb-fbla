import { describe, expect, it } from 'vitest';
import { profileSearchFilter } from './search';

describe('profileSearchFilter', () => {
  it('keeps underscores and escapes them as LIKE literals', () => {
    expect(profileSearchFilter('smoke_tester_two')).toBe(
      String.raw`username.ilike."smoke\\_tester\\_two%",display_name.ilike."%smoke\\_tester\\_two%"`,
    );
  });
  it('strips a leading @ and lowercases the username part', () => {
    expect(profileSearchFilter('@Smoke')).toBe('username.ilike."smoke%",display_name.ilike."%Smoke%"');
  });
  it('quotes values so commas and parentheses stay inside the filter', () => {
    expect(profileSearchFilter('a,b)')).toBe('username.ilike."a,b)%",display_name.ilike."%a,b)%"');
  });
  it('rejects short queries', () => {
    expect(profileSearchFilter(' a ')).toBeNull();
    expect(profileSearchFilter('"*')).toBeNull();
  });
});
