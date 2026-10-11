-- 0150 Rate-limit fbla_check_answer (security review, Omega fbla-redteam track).
--
-- Finding (HIGH, in-app key enumeration): public.fbla_check_answer returns the correct choice and the
-- explanation for ANY official question id, for any signed-in member, with no run required and no rate limit.
-- A script can therefore dump the entire 1,500-question answer bank in one pass (~1,500 calls). Proven live
-- (rolled back): fbla_check_answer('acc-001', null) -> {"correct_choice":0, "explain":"Assets equal ..."}.
--
-- This migration adds a per-member rate limit to the key-revealing path and nothing else. The limits only count
-- when a NEW key is about to be disclosed (a question's first sight, or a reveal whose 24h binding window has
-- lapsed): re-checking a question already seen in the last 24h returns the cached result early and is never
-- counted, so normal practice and review are unaffected. Instant feedback during a practice set reveals one key
-- every several seconds of reading, far under these caps; a scripted bank dump trips them immediately.
--
--   * at most 45 new key reveals per rolling 60 seconds  (stops a tight dump loop)
--   * at most 300 new key reveals per rolling 60 minutes  (a full 1,500-question dump now takes 5+ hours)
--
-- This is defence-in-depth for the in-app path. The ROOT cause is that the authoritative answer keys are
-- committed to the PUBLIC GitHub repo (content/*.json and supabase/seed/fbla_questions.sql); that must be fixed
-- out-of-band (make the content source private / stop committing answers). See hq/reports/fbla-redteam.md.
--
-- The body is identical to 0014's fbla_check_answer except for the RATE LIMIT block, marked below.

create or replace function public.fbla_check_answer(p_question_id text, p_chosen integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  k record;
  r public.fbla_question_reveals;
  v_ok boolean;
  v_rated boolean;
  v_recent_min int;
  v_recent_hr int;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = v_uid) then
    raise exception 'create your profile first' using errcode = '42501';
  end if;
  if p_chosen is not null and p_chosen not between 0 and 3 then
    raise exception 'pick one of the four choices' using errcode = '22023';
  end if;
  select * into k from fbla_private.fbla_question_key(p_question_id);
  if not found then raise exception 'unknown question %', p_question_id using errcode = '22023'; end if;
  if k.test_id is not null and not (public.fbla_in_chapter(k.chapter_id)
       and (k.published or public.fbla_can_manage(k.chapter_id, k.event))) then
    raise exception 'unknown question %', p_question_id using errcode = '22023';
  end if;

  -- one check per member and question at a time
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || '|' || p_question_id, 0));
  select * into r from public.fbla_question_reveals where user_id = v_uid and question_id = p_question_id;
  if found and r.pending and r.revealed_at > now() - interval '24 hours' then
    -- already seen this question recently: return the cached result, do NOT count against the rate limit
    return jsonb_build_object('question_id', p_question_id, 'chosen', r.chosen, 'correct', r.correct,
      'correct_choice', k.answer, 'explain', k.explain);
  end if;

  -- ----------------------------------------------------------------- RATE LIMIT (0150)
  -- Counts only reveals that actually disclosed a key (revealed_at is set on every disclosing upsert). The
  -- cached-return above means re-checks of the same question within 24h do not reach here.
  select count(*) filter (where revealed_at > now() - interval '1 minute'),
         count(*) filter (where revealed_at > now() - interval '1 hour')
    into v_recent_min, v_recent_hr
  from public.fbla_question_reveals
  where user_id = v_uid and revealed_at > now() - interval '1 hour';
  if v_recent_min >= 45 or v_recent_hr >= 300 then
    raise exception 'You are checking answers very quickly. Take a short break and try again.'
      using errcode = '53400';
  end if;
  -- ----------------------------------------------------------------- end RATE LIMIT

  v_ok := p_chosen is not null and p_chosen = k.answer;
  v_rated := k.test_id is null and r.user_id is null
    and not exists (select 1 from public.fbla_answers where user_id = v_uid and question_id = p_question_id);
  insert into public.fbla_question_reveals (user_id, question_id, chosen, correct, rated, pending, revealed_at)
  values (v_uid, p_question_id, p_chosen, v_ok, v_rated, true, now())
  on conflict (user_id, question_id) do update
    set chosen = excluded.chosen, correct = excluded.correct, rated = excluded.rated, pending = true,
        revealed_at = excluded.revealed_at;
  -- a chapter question copied from the official bank reveals that key too
  if k.src is not null then perform fbla_private.fbla_mark_revealed(v_uid, array[k.src]); end if;

  return jsonb_build_object('question_id', p_question_id, 'chosen', p_chosen, 'correct', v_ok,
    'correct_choice', k.answer, 'explain', k.explain);
end $$;

revoke all on function public.fbla_check_answer(text, integer) from public, anon;
grant execute on function public.fbla_check_answer(text, integer) to authenticated;
