-- 0019 Profile privacy.
--
-- Every signed-in user could read every profile's email_opt_in (fbla_profiles_read is `true` and the column was
-- granted). It is now readable only by its owner, through fbla_my_profile(); members can still update it.
-- last_seen_at and last_active_date stay public on purpose: chapter rosters, member pages and streaks show them.
-- elo_exact (0014) is not needed by clients either: the shown rating is `elo`.

revoke select on public.fbla_profiles from authenticated;
revoke select (email_opt_in, elo_exact) on public.fbla_profiles from authenticated;
grant select (id, username, display_name, avatar_url, school, grade, main_event, bio, chapter_id, elo, peak_elo,
              questions_answered, questions_correct, time_spent_ms, current_streak, best_streak, answer_streak,
              best_answer_streak, last_active_date, duel_wins, duel_losses, duel_draws, last_seen_at, created_at)
  on public.fbla_profiles to authenticated;

-- The caller's own profile, every column the app uses (email_opt_in included).
create or replace function public.fbla_my_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(p) - 'elo_exact' from public.fbla_profiles p where p.id = (select auth.uid())
$$;
revoke all on function public.fbla_my_profile() from public, anon;
grant execute on function public.fbla_my_profile() to authenticated;
