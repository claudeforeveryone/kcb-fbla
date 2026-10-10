-- A new profile row can only set who you are; the leaderboard columns start at their defaults (0).
revoke insert on public.fbla_profiles from authenticated, anon;
grant insert (id, name, grade) on public.fbla_profiles to authenticated;
