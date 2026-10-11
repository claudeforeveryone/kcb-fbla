import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { appUrl, supabase } from './supabase';
import { SplashScreen } from '../components/layout/SplashScreen';

/** Row of public.fbla_profiles (see docs/SPEC.md). */
export type AuthProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  school: string | null;
  grade: number | null;
  main_event: string | null;
  bio: string | null;
  chapter_id: string | null;
  elo: number;
  peak_elo: number;
  questions_answered: number;
  questions_correct: number;
  time_spent_ms: number;
  current_streak: number;
  best_streak: number;
  best_answer_streak: number;
  last_active_date: string | null;
  duel_wins: number;
  duel_losses: number;
  duel_draws: number;
  email_opt_in: boolean;
  last_seen_at: string | null;
  created_at: string;
};

export type NewProfile = {
  username: string;
  display_name: string;
  school?: string | null;
  grade?: number | null;
  main_event?: string | null;
  avatar_url?: string | null;
};

type SignUpResult = { needsConfirmation: boolean };

type AuthContextValue = {
  /** True until the stored session (and its profile) has been checked. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  /** Set when the user arrived from a password-recovery email link. */
  recovering: boolean;
  refreshProfile: () => Promise<AuthProfile | null>;
  /** Optimistically merge fields into the cached profile (after a successful update elsewhere). */
  patchProfile: (patch: Partial<AuthProfile>) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  createProfile: (p: NewProfile) => Promise<AuthProfile | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(uid: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase.from('fbla_profiles').select('*').eq('id', uid).maybeSingle();
  if (error) {
    console.warn('[auth] profile load failed', error.message);
    return null;
  }
  return (data as AuthProfile | null) ?? null;
}

/** Which auth action failed; the same Supabase error needs different advice per flow. */
export type AuthAction = 'signin' | 'signup' | 'resend' | 'reset' | 'update';

/**
 * Stable kinds the auth pages branch on:
 * - email_limit: the project's hourly confirmation/reset email quota is used up (Supabase `over_email_send_rate_limit`).
 * - email_cooldown: the per-address "wait N seconds before another email" guard.
 * - request_limit: too many requests from this network (`over_request_rate_limit`).
 * - not_confirmed: the account exists but the email was never confirmed.
 */
export type AuthErrorKind = 'email_limit' | 'email_cooldown' | 'request_limit' | 'not_confirmed' | 'exists' | 'other';

export class AuthFlowError extends Error {
  readonly kind: AuthErrorKind;
  constructor(message: string, kind: AuthErrorKind) {
    super(message);
    this.name = 'AuthFlowError';
    this.kind = kind;
  }
}

function classify(e: unknown): { kind: AuthErrorKind; msg: string; wait: number | null } {
  const o = e && typeof e === 'object' ? (e as { message?: unknown; code?: unknown; status?: unknown }) : null;
  const msg = o && 'message' in o ? String(o.message ?? '') : String(e ?? '');
  const code = o && typeof o.code === 'string' ? o.code : '';
  const m = msg.toLowerCase();
  const waitMatch = /after (\d+) seconds?/.exec(m);
  const wait = waitMatch ? Number(waitMatch[1]) : null;
  if (code === 'over_email_send_rate_limit' || m.includes('email rate limit'))
    return { kind: wait != null ? 'email_cooldown' : 'email_limit', msg, wait };
  if (wait != null && m.includes('for security purposes')) return { kind: 'email_cooldown', msg, wait };
  if (code === 'over_request_rate_limit' || m.includes('rate limit') || m.includes('too many'))
    return { kind: 'request_limit', msg, wait };
  if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return { kind: 'not_confirmed', msg, wait };
  if (code === 'user_already_exists' || code === 'email_exists' || m.includes('already registered') || m.includes('already been registered'))
    return { kind: 'exists', msg, wait };
  return { kind: 'other', msg, wait };
}

/** Friendlier copy for common Supabase auth errors. */
export function authErrorMessage(e: unknown, action: AuthAction = 'signin'): string {
  const { kind, msg, wait } = classify(e);
  const m = msg.toLowerCase();
  switch (kind) {
    case 'email_limit':
      if (action === 'signup')
        return 'Sign-ups are busy right now: we hit our hourly limit for sending confirmation emails, so your account was not created yet. Please try again in about an hour.';
      if (action === 'reset') return 'We hit our hourly limit for sending emails. Please request a reset link again in about an hour.';
      return 'We hit our hourly limit for sending emails. Please try again in about an hour.';
    case 'email_cooldown':
      return `We just sent an email to this address. Wait ${wait ?? 60} seconds before asking for another one.`;
    case 'request_limit':
      return 'Too many attempts from this network. Wait a few minutes and try again.';
    case 'not_confirmed':
      return 'Please confirm your email first. Check your inbox (and spam) for the link, or send a new one below.';
    case 'exists':
      return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('invalid login credentials')) return 'That email and password do not match. Try again or reset your password.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Choose a stronger password: at least 8 characters.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the server. Check your connection.';
  return msg || 'Something went wrong. Please try again.';
}

function toAuthError(e: unknown, action: AuthAction): AuthFlowError {
  return new AuthFlowError(authErrorMessage(e, action), classify(e).kind);
}

/** The AuthErrorKind of an error thrown by useAuth() actions ('other' for anything else). */
export function authErrorKind(e: unknown): AuthErrorKind {
  return e instanceof AuthFlowError ? e.kind : 'other';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  // The user id whose profile lookup has finished (so guards never act on a half-loaded state).
  const [checkedUid, setCheckedUid] = useState<string | null>(null);
  const uidRef = useRef<string | null>(null);

  const loadFor = useCallback(async (uid: string | null) => {
    uidRef.current = uid;
    if (!uid) {
      setProfile(null);
      return null;
    }
    const p = await fetchProfile(uid);
    if (uidRef.current === uid) {
      setProfile(p);
      setCheckedUid(uid);
    }
    return p;
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadFor(data.session?.user.id ?? null);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        uidRef.current = null;
        setProfile(null);
        setRecovering(false);
        return;
      }
      const uid = s?.user.id ?? null;
      // Defer Supabase calls out of the auth callback (avoids a client lock deadlock).
      if (uid !== uidRef.current) window.setTimeout(() => void loadFor(uid), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadFor]);

  const refreshProfile = useCallback(() => loadFor(session?.user.id ?? uidRef.current), [loadFor, session]);

  const patchProfile = useCallback((patch: Partial<AuthProfile>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw toAuthError(error, 'signin');
      setSession(data.session);
      await loadFor(data.user?.id ?? null);
    },
    [loadFor],
  );

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: appUrl('onboarding') },
    });
    if (error) throw toAuthError(error, 'signup');
    // Supabase returns a user with no identities when the email is already registered (and confirmations are on).
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      throw new AuthFlowError('An account with this email already exists. Try signing in instead.', 'exists');
    if (data.session) {
      setSession(data.session);
      uidRef.current = data.session.user.id;
      setProfile(null);
      setCheckedUid(data.session.user.id);
      return { needsConfirmation: false };
    }
    return { needsConfirmation: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    uidRef.current = null;
    setSession(null);
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('reset/update') });
    if (error) throw toAuthError(error, 'reset');
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw toAuthError(error, 'update');
    setRecovering(false);
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: appUrl('onboarding') },
    });
    if (error) throw toAuthError(error, 'resend');
  }, []);

  const createProfile = useCallback(
    async (p: NewProfile) => {
      // fbla_create_profile (0007_core_rpcs.sql) creates the row, or updates cosmetic fields if it exists.
      const { error } = await supabase.rpc('fbla_create_profile', {
        p_username: p.username.trim().toLowerCase(),
        p_display_name: p.display_name.trim(),
        p_school: p.school?.trim() || null,
        p_grade: p.grade ?? null,
        p_main_event: p.main_event || null,
      });
      if (error) {
        const m = error.message.toLowerCase();
        if (error.code === '23505' || m.includes('duplicate') || m.includes('taken'))
          throw new Error('That username was just taken. Try another.');
        throw new Error(error.message);
      }
      const uid = session?.user.id ?? uidRef.current;
      if (uid && p.avatar_url) {
        // avatar_url is a cosmetic column the owner may update directly.
        const up = await supabase.from('fbla_profiles').update({ avatar_url: p.avatar_url }).eq('id', uid);
        if (up.error) console.warn('[auth] avatar save failed', up.error.message);
      }
      return loadFor(uid);
    },
    [loadFor, session],
  );

  const sessionUid = session?.user.id ?? null;
  const busy = loading || (sessionUid != null && checkedUid !== sessionUid);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: busy,
      session,
      user: session?.user ?? null,
      profile,
      recovering,
      refreshProfile,
      patchProfile,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      resendConfirmation,
      createProfile,
    }),
    [busy, session, profile, recovering, refreshProfile, patchProfile, signIn, signUp, signOut, resetPassword, updatePassword, resendConfirmation, createProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user's profile. Only use under <RequireProfile>. */
export function useProfile(): AuthProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useProfile used outside <RequireProfile>');
  return profile;
}

function nextParam(loc: { pathname: string; search: string }) {
  return encodeURIComponent(loc.pathname + loc.search);
}

/** Signed-in users only; others go to /login?next=... */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { loading, session } = useAuth();
  const loc = useLocation();
  if (loading) return <SplashScreen />;
  if (!session) return <Navigate to={`/login?next=${nextParam(loc)}`} replace />;
  return <>{children ?? <Outlet />}</>;
}

/** Signed-in users with a profile; users without one go to /onboarding. */
export function RequireProfile({ children }: { children?: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <SplashScreen />;
  if (!session) return <Navigate to={`/login?next=${nextParam(loc)}`} replace />;
  if (!profile) return <Navigate to={`/onboarding?next=${nextParam(loc)}`} replace />;
  return <>{children ?? <Outlet />}</>;
}

/** For /login and /signup: signed-in users are sent on. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const loc = useLocation();
  if (loading) return <SplashScreen />;
  if (session) {
    const next = safeNext(new URLSearchParams(loc.search).get('next'));
    return <Navigate to={profile ? next : `/onboarding?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

/** Only allow in-app relative redirects. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next) return fallback;
  try {
    const d = decodeURIComponent(next);
    return d.startsWith('/') && !d.startsWith('//') ? d : fallback;
  } catch {
    return fallback;
  }
}
