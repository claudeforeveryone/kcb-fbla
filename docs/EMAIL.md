# Email and notifications

KCB FBLA sends three kinds of email, all through [Resend](https://resend.com):

| Email | When | Edge function |
|---|---|---|
| Weekly digest: questions, accuracy, Elo change, streak, rank, open assignments, latest chapter newsletter, focus area | Mondays 13:00 UTC (pg_cron) to members active in the last 7 days | `weekly-digest` |
| "We miss you" nudge (or "your first set is waiting" for members who never played) | Same run, to members idle 7+ days. At most 4 in a row, then it stops until they come back | `weekly-digest` |
| Chapter newsletter | Right after a post with `kind = 'newsletter'` is inserted (database trigger, pg_net) | `send-newsletter` |

Every email has a signed one-click unsubscribe link (`email-unsubscribe`) and `List-Unsubscribe` headers. It sets
`fbla_profiles.email_opt_in = false` and redirects to `/notifications?email=unsubscribed`, where the member sees a
confirmation and can turn email back on. Members can also toggle it on the Notifications page.

Without `RESEND_API_KEY` everything still runs in **dry-run mode**: the functions build every email, log a summary
and return it as JSON, but send nothing.

## Setup (one time)

1. **Create a Resend account and API key.** Resend dashboard > API Keys > Create (sending access is enough).
2. **Store it as an edge function secret** (never in the repo):
   - Supabase dashboard > Project `kcb-fbla` > Edge Functions > Secrets > add `RESEND_API_KEY`, or
   - `supabase secrets set RESEND_API_KEY=re_... --project-ref uhgzeuvybyohdbfuhfil`
3. **Verify a sending domain** in Resend (Domains > Add, then add the DNS records it shows). Until a domain is
   verified, Resend only delivers `onboarding@resend.dev` mail to the Resend account owner's own address, which
   is fine for testing.
4. **Set the sender and site URL** (SQL editor, as postgres):

   ```sql
   update fbla_private.email_config set value = 'KCB FBLA <news@your-domain.ca>' where key = 'email_from';
   update fbla_private.email_config set value = 'advisor@your-school.ca'           where key = 'reply_to';  -- optional
   update fbla_private.email_config set value = 'https://kcb-fbla.vercel.app'      where key = 'site_url';  -- links + logo
   ```

That's it. The schedule, triggers and functions are already deployed.

## How it fits together

- `supabase/migrations/0012_email.sql` holds everything on the database side:
  - `fbla_private.email_config`: site URL, functions URL, from/reply-to. Not readable by clients.
  - `fbla_private.email_log`: one row per email sent `(user, kind, ref)`. `ref` is the ISO week for digests and
    the post id for newsletters, so re-running a job never double-sends.
  - A random token in **Vault** (`fbla_email_token`), generated inside the database. pg_net sends it as the
    `x-fbla-token` header and the functions check it via `fbla_email_config()`. It also keys the HMAC in the
    unsubscribe links. Nobody needs to copy it anywhere.
  - Service-role-only RPCs used by the functions: `fbla_email_config`, `fbla_email_digest_recipients`,
    `fbla_email_newsletter`, `fbla_email_log_sent`, `fbla_email_unsubscribe`, `fbla_email_site_url`.
  - pg_cron job `fbla-weekly-digest` (`0 13 * * 1`) calls `fbla_private.invoke_function('weekly-digest')`.
  - Notification triggers (see below).
- `supabase/functions/_shared/email.ts`: the branded HTML layout (navy band, red rule, FBLC palette, Work Sans/Open
  Sans with safe fallbacks), Resend batch sending (100 per call), markdown-lite rendering for newsletters.
- The functions are deployed with `verify_jwt = false` because they authenticate with the Vault token (and the
  unsubscribe link with its HMAC signature) instead of a user JWT.

### Redeploying the functions

`supabase functions deploy weekly-digest send-newsletter email-unsubscribe --no-verify-jwt --project-ref uhgzeuvybyohdbfuhfil`
(or the Supabase MCP `deploy_edge_function`, including `../_shared/email.ts` in the files).

## Testing

Run these in the SQL editor. Responses land in `net._http_response` a second or two later.

```sql
-- dry run of this week's digest (counts + subjects, nothing sent, nothing logged)
select fbla_private.invoke_function('weekly-digest', '{"dry_run": true}');

-- one member's email, rendered (returns subject, text and html)
select fbla_private.invoke_function('weekly-digest',
  jsonb_build_object('preview', true, 'user_id', (select id from fbla_profiles where username = 'someone')));

-- preview a newsletter email
select fbla_private.invoke_function('send-newsletter', jsonb_build_object('post_id', '<post uuid>', 'preview', true));

select id, status_code, content from net._http_response order by id desc limit 3;

-- what was sent
select kind, ref, count(*) from fbla_private.email_log group by 1, 2 order by 2 desc;

-- the schedule
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

To send this week's digest again to everyone (for example after fixing the sender), delete that week's rows:
`delete from fbla_private.email_log where kind in ('digest','nudge') and ref = '2026-W41';`

## In-app notifications

Rows in `fbla_notifications` are only written server-side (`fbla_notify`). The bell in the top bar and
`/notifications` read them, with Supabase Realtime pushing new rows instantly (and a toast plus a bell wiggle).

| Event | Kind | Source |
|---|---|---|
| Duel challenge, accepted, declined, result, expired | `duel_*` | Arena RPCs (0010), with 0012 triggers as a safety net |
| Friend request / accepted | `friend_*` | Arena RPCs (0010), 0012 trigger safety net |
| Role change, trainer, presidency | `chapter_role`, `role_change`, `trainer_assigned` | Chapter RPCs (0011), 0012 triggers |
| Removed / banned / unbanned / added | `chapter_removed`, `chapter_banned`, `chapter_unbanned`, `chapter_added` | Chapter RPCs (0011), 0012 triggers |
| New announcement / newsletter | `announcement`, `newsletter` | 0012 trigger on `fbla_posts` |
| New assignment | `assignment` | 0012 trigger on `fbla_assignments` |
| Achievement earned | `achievement` | `fbla_award_achievement` (0007) |
| Someone joined your chapter (to execs) | `chapter_join` | `fbla_join_chapter` (0007) |

The 0012 triggers are deferred to commit and skip a user who already got a notification about the same thing
(same kind family and same entity id) in that transaction, so an RPC that notifies on its own never causes a
duplicate, and a direct table write still notifies.
