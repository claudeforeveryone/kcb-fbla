-- 0102 FBLA analytics: server-recorded events (Omega owner console). Ledger name: fbla_0102_analytics_server_events.
--
-- These triggers sit on the tables the existing RPCs write (fbla_submit_attempt, fbla_start_duel / fbla_submit_duel,
-- fbla_vocab_review, fbla_create_profile), so the facts are recorded by the database when they are committed and a
-- client cannot fake or inflate them. The RPC bodies are not touched (they are owned by other areas and hold the Elo
-- rule). Each trigger body runs in its own exception block: an analytics fault can never roll back the write that
-- caused it.
--
-- Event definitions:
--   onboarding_completed     first fbla_profiles row for a user (fbla_create_profile upserts, so re-saves do not count)
--   practice_completed       a graded attempt of any kind except mock and duel; meta.mode = attempt kind. Not for a
--                            finished deck assignment (fbla_complete_deck_assignment): that is flashcard study, its
--                            total and correct are cards gone through and cards the student said they knew, and the
--                            app never records a practice_started for it.
--   exam_completed           a graded mock exam attempt
--                            Neither carries a question count: fbla_submit_attempt inserts the attempt with total 0 and
--                            fills the total in afterwards, so an AFTER INSERT trigger cannot see it.
--   duel_started             a player opens their run of an accepted duel (one fbla_duel_runs row per player)
--   duel_completed           a duel reaches status complete; one event per player, meta.outcome win|loss|draw. The
--                            second player's submission settles the duel, so the first player did nothing at that
--                            moment: the owner metrics do not count this event as activity (0105 fbla_activity).
--   vocab_session_completed  one vocab study session. A session starts with a review that comes after 30 quiet
--                            minutes (no review by that student in the 30 minutes before it), and the event is
--                            recorded at that first review, so a long unbroken sitting is one session however long
--                            it runs. fbla_vocab_review flushes reviews in debounced batches and stamps every term in a
--                            batch with the same now(). Any session event in the last 30 minutes also means "same
--                            session": a batch that re-reviews the last term before a new one (the client's retry puts
--                            a failed batch back in front of the queue) stamps that term with now() first, which would
--                            otherwise hide the review it just replaced. The name comes from the shared taxonomy; read
--                            it as "vocab session".

create or replace function fbla_private.fbla_trg_analytics_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform fbla_private.fbla_record_event('onboarding_completed', new.id, new.main_event,
      jsonb_build_object('source', 'profile'));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_onboarding on public.fbla_profiles;
create trigger fbla_analytics_onboarding
  after insert on public.fbla_profiles
  for each row execute function fbla_private.fbla_trg_analytics_onboarding();

create or replace function fbla_private.fbla_trg_analytics_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'duel' then
    return new;
  end if;
  begin
    if new.assignment_id is not null
       and exists (select 1 from public.fbla_assignments s where s.id = new.assignment_id and s.kind = 'deck') then
      return new;
    end if;
    perform fbla_private.fbla_record_event(
      case when new.kind = 'mock' then 'exam_completed' else 'practice_completed' end,
      new.user_id, new.event, jsonb_build_object('mode', new.kind));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_attempt on public.fbla_attempts;
create trigger fbla_analytics_attempt
  after insert on public.fbla_attempts
  for each row execute function fbla_private.fbla_trg_analytics_attempt();

create or replace function fbla_private.fbla_trg_analytics_duel_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform fbla_private.fbla_record_event('duel_started', new.user_id,
      (select d.event from public.fbla_duels d where d.id = new.duel_id),
      jsonb_build_object('mode', 'duel'));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_duel_started on public.fbla_duel_runs;
create trigger fbla_analytics_duel_started
  after insert on public.fbla_duel_runs
  for each row execute function fbla_private.fbla_trg_analytics_duel_started();

create or replace function fbla_private.fbla_trg_analytics_duel_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid;
begin
  if new.status = 'complete' and old.status is distinct from 'complete' then
    begin
      foreach v_player in array array[new.challenger_id, new.opponent_id] loop
        perform fbla_private.fbla_record_event('duel_completed', v_player, new.event,
          jsonb_build_object('mode', 'duel', 'outcome',
            case when new.winner_id is null then 'draw' when new.winner_id = v_player then 'win' else 'loss' end));
      end loop;
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_duel_completed on public.fbla_duels;
create trigger fbla_analytics_duel_completed
  after update of status on public.fbla_duels
  for each row execute function fbla_private.fbla_trg_analytics_duel_completed();

-- Vocab: fbla_vocab_review stamps last_reviewed_at = now() on every reviewed term (insert-then-update for new terms).
create or replace function fbla_private.fbla_trg_analytics_vocab()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_mode text;
begin
  if new.last_reviewed_at is null or new.last_reviewed_at is not distinct from old.last_reviewed_at then
    return new;
  end if;
  begin
    -- Same session: a session event in the last 30 minutes (this batch's included: it carries this transaction's
    -- now()), or the student reviewed something, this term included, in the 30 minutes before this batch. The last
    -- check keeps a sitting longer than 30 minutes to one session.
    if exists (
         select 1 from public.fbla_analytics_events e
          where e.user_id = new.user_id
            and e.event_name = 'vocab_session_completed'
            and e.created_at >= now() - interval '30 minutes')
       or (old.last_reviewed_at >= now() - interval '30 minutes' and old.last_reviewed_at < now())
       or exists (
         select 1 from public.fbla_vocab_progress p
          where p.user_id = new.user_id
            and p.last_reviewed_at >= now() - interval '30 minutes'
            and p.last_reviewed_at < now()) then
      return new;
    end if;
    if new.term_id like 'deck:%' then
      v_mode := 'deck';
      select d.event into v_code from public.fbla_decks d where d.id::text = split_part(new.term_id, ':', 2);
    else
      v_mode := 'official';
      select t.event into v_code from public.fbla_vocab_terms t where t.id = new.term_id;
    end if;
    perform fbla_private.fbla_record_event('vocab_session_completed', new.user_id, v_code,
      jsonb_build_object('mode', v_mode));
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists fbla_analytics_vocab on public.fbla_vocab_progress;
create trigger fbla_analytics_vocab
  after update of last_reviewed_at on public.fbla_vocab_progress
  for each row execute function fbla_private.fbla_trg_analytics_vocab();

revoke all on function fbla_private.fbla_trg_analytics_onboarding() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_analytics_attempt() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_analytics_duel_started() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_analytics_duel_completed() from public, anon, authenticated;
revoke all on function fbla_private.fbla_trg_analytics_vocab() from public, anon, authenticated;
