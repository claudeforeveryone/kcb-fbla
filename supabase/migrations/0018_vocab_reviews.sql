-- 0018 Vocab progress through the server.
--
-- Before: members wrote fbla_vocab_progress directly, any term_id and any box / counts / due date, so 'vocab_100'
-- (100 terms in box 4+) and the vocab numbers staff see could be faked with one insert.
-- Now:
--   * fbla_vocab_terms lists the official terms (seeded below from content/*.json; when terms are
--     added to the content, insert their ids too, or reviews of them are rejected). Chapter deck cards are
--     deck:<deckId>:<n>, checked against the deck.
--   * fbla_vocab_review(p_reviews) records reviews: [{term_id, correct}] and applies the Leitner rules on the server
--     (src/pages/vocab/leitner.ts): a miss drops to box 0; a correct answer moves up one box only when the term is
--     due (or new) and schedules it 0/1/3/7/14/30 days out, so mastery (box 4) takes at least 11 days of reviews.
--   * Clients can no longer insert or update progress rows (they can still delete their own to reset a deck).
--   * Trainers see members' progress only for terms of the events they train (official terms by event, deck cards
--     by the deck's event); presidents and executives see all of it.

create table if not exists public.fbla_vocab_terms (
  id text primary key,
  event text not null
);
alter table public.fbla_vocab_terms enable row level security;
revoke all on public.fbla_vocab_terms from anon, authenticated;

-- every event has 60 official terms, <prefix>-v001 .. <prefix>-v060 (checked against content/*.json)
insert into public.fbla_vocab_terms (id, event)
select e.prefix || '-v' || lpad(n::text, 3, '0'), e.event
from (values
  ('accounting', 'acc'),
  ('business-law', 'law'),
  ('data-science-ai', 'dsa'),
  ('personal-finance', 'pf'),
  ('securities-investments', 'sec'),
  ('organizational-leadership', 'ol'),
  ('intro-business-concepts', 'ibc'),
  ('healthcare-administration', 'hca'),
  ('economics', 'eco'),
  ('business-management', 'bm'),
  ('marketing', 'mkt'),
  ('international-business', 'ib'),
  ('sports-entertainment-management', 'sem'),
  ('entrepreneurship', 'ent'),
  ('hospitality-event-management', 'hem')
) e(event, prefix)
cross join generate_series(1, 60) n
on conflict (id) do update set event = excluded.event;

-- deck:<uuid>:<n> -> the deck id, or null when the id is malformed
create or replace function public.fbla_deck_card_deck(p_term text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when split_part(p_term, ':', 1) = 'deck'
     and split_part(p_term, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and split_part(p_term, ':', 3) ~ '^[0-9]{1,4}$'
     and split_part(p_term, ':', 4) = ''
    then split_part(p_term, ':', 2)::uuid
  end
$$;
revoke all on function public.fbla_deck_card_deck(text) from public, anon;
grant execute on function public.fbla_deck_card_deck(text) to authenticated;

-- event of a term id (official term or deck card), for RLS
create or replace function public.fbla_vocab_term_event(p_term text)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_term like 'deck:%' then
      (select d.event from public.fbla_decks d where d.id = public.fbla_deck_card_deck(p_term))
    else (select t.event from public.fbla_vocab_terms t where t.id = p_term)
  end
$$;
revoke all on function public.fbla_vocab_term_event(text) from public, anon;
grant execute on function public.fbla_vocab_term_event(text) to authenticated;

drop policy if exists fbla_vocab_read on public.fbla_vocab_progress;
create policy fbla_vocab_read on public.fbla_vocab_progress for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.fbla_can_view_member(user_id))
         or (select public.fbla_can_view_member_event(user_id, public.fbla_vocab_term_event(term_id))));

-- writes go through fbla_vocab_review
drop policy if exists fbla_vocab_insert on public.fbla_vocab_progress;
drop policy if exists fbla_vocab_update on public.fbla_vocab_progress;
revoke insert, update on public.fbla_vocab_progress from authenticated;

-- p_reviews: [{term_id, correct}] in the order they happened (at most 500). Returns the updated rows.
create or replace function public.fbla_vocab_review(p_reviews jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_eod timestamptz := ((public.fbla_today() + 1)::timestamp at time zone 'America/Toronto');
  v_days int[] := array[0, 1, 3, 7, 14, 30];
  rv jsonb;
  v_term text;
  v_ok boolean;
  v_deck uuid;
  p public.fbla_vocab_progress;
  v_box int;
  v_touched text[] := '{}';
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.fbla_profiles where id = v_uid) then
    raise exception 'create your profile first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_reviews) is distinct from 'array' then
    raise exception 'reviews must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_reviews) > 500 then raise exception 'too many reviews at once' using errcode = '22023'; end if;

  for rv in select value from jsonb_array_elements(p_reviews) loop
    v_term := rv->>'term_id';
    v_ok := case when jsonb_typeof(rv->'correct') = 'boolean' then (rv->>'correct')::boolean end;
    if v_term is null or v_ok is null then
      raise exception 'each review needs term_id and correct' using errcode = '22023';
    end if;

    if v_term like 'deck:%' then
      v_deck := public.fbla_deck_card_deck(v_term);
      if v_deck is null or not exists (
           select 1 from public.fbla_decks d
           where d.id = v_deck and public.fbla_in_chapter(d.chapter_id)
             and split_part(v_term, ':', 3)::int < jsonb_array_length(d.cards)) then
        raise exception 'unknown card %', v_term using errcode = '22023';
      end if;
    elsif not exists (select 1 from public.fbla_vocab_terms where id = v_term) then
      raise exception 'unknown term %', v_term using errcode = '22023';
    end if;

    select * into p from public.fbla_vocab_progress where user_id = v_uid and term_id = v_term for update;
    if not found then
      insert into public.fbla_vocab_progress (user_id, term_id, box, due_at, correct_count, wrong_count)
      values (v_uid, v_term, 0, v_now, 0, 0);
      v_box := -1; -- new: always eligible
    else
      v_box := p.box;
    end if;

    if not v_ok then
      update public.fbla_vocab_progress
        set box = 0, due_at = v_now, wrong_count = wrong_count + 1, last_reviewed_at = v_now
        where user_id = v_uid and term_id = v_term;
    elsif v_box = -1 or p.due_at <= v_eod then
      v_box := least(5, greatest(v_box, 0) + 1);
      update public.fbla_vocab_progress
        set box = v_box, due_at = v_now + make_interval(days => v_days[v_box + 1]),
            correct_count = correct_count + 1, last_reviewed_at = v_now
        where user_id = v_uid and term_id = v_term;
    else
      -- not due yet: counted, not promoted
      update public.fbla_vocab_progress
        set correct_count = correct_count + 1, last_reviewed_at = v_now
        where user_id = v_uid and term_id = v_term;
    end if;
    v_touched := v_touched || v_term;
  end loop;

  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'user_id')
    from public.fbla_vocab_progress x
    where x.user_id = v_uid and x.term_id = any (v_touched)), '[]'::jsonb);
end $$;
revoke all on function public.fbla_vocab_review(jsonb) from public, anon;
grant execute on function public.fbla_vocab_review(jsonb) to authenticated;
