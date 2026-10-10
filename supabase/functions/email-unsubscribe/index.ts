// email-unsubscribe: the signed link in every email footer (and the List-Unsubscribe header).
//   GET  ?u=<user id>&s=<signature>  turns email off, then redirects to the site's notifications page,
//                                    which shows a confirmation with a one-click "turn back on".
//   POST (RFC 8058 one-click from mail clients) turns email off and returns 200.
// The signature is an HMAC of the user id keyed with the Vault token, checked in fbla_email_unsubscribe().

import { rpc } from '../_shared/email.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const u = url.searchParams.get('u') ?? '';
  const s = url.searchParams.get('s') ?? '';

  let ok = false;
  if (UUID.test(u) && /^[0-9a-f]{32}$/.test(s)) {
    try {
      ok = (await rpc<boolean>('fbla_email_unsubscribe', { p_user: u, p_sig: s })) === true;
    } catch (e) {
      console.error('[email-unsubscribe] rpc failed', e);
    }
  }

  if (req.method === 'POST') {
    return new Response(ok ? 'unsubscribed' : 'invalid link', { status: ok ? 200 : 400 });
  }

  let site = '';
  try {
    site = (await rpc<string | null>('fbla_email_site_url')) ?? '';
  } catch {
    // fall through to the plain response
  }
  if (!site) return new Response(ok ? 'You have been unsubscribed from KCB FBLA emails.' : 'This link is not valid.', { status: ok ? 200 : 400 });
  return Response.redirect(`${site}/notifications?email=${ok ? 'unsubscribed' : 'invalid'}`, 303);
});
