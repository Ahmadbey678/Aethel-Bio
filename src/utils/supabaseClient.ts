import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Read a Vite env var defensively: trims whitespace and falls back to an
 * empty string. This guarantees `createClient()` is only ever called with
 * valid non-empty strings — a missing or blank `VITE_SUPABASE_URL` must never
 * throw a "supabaseUrl is required" exception on mount.
 */
function readEnvVar(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  return typeof value === "string" ? value.trim() : "";
}

const supabaseUrl = readEnvVar("VITE_SUPABASE_URL");
const supabaseAnonKey = readEnvVar("VITE_SUPABASE_ANON_KEY");

/**
 * `null` when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't configured
 * (e.g. a deploy target that hasn't set the env vars yet), so Supabase-backed
 * features can degrade gracefully instead of crashing the app.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (!supabase) {
  const missing = [
    supabaseUrl ? null : "VITE_SUPABASE_URL",
    supabaseAnonKey ? null : "VITE_SUPABASE_ANON_KEY",
  ]
    .filter(Boolean)
    .join(" and ");
  console.warn(
    `Supabase is not configured — missing ${missing}. ` +
      "Unmatched Registry persistence will be disabled.",
  );
}

/** True when the Supabase client initialised with valid credentials. */
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

/** High-privilege role required to access the Unmatched Patient Registry. */
export const ADMIN_ROLE = "admin";

/**
 * Typed view of `user.app_metadata`. The Supabase SDK types `app_metadata`
 * with an `any` index signature; this narrows it so callers never touch `any`.
 */
interface AppMetadata {
  role?: string;
  [key: string]: unknown;
}

/** Extract the user's `app_metadata.role` from a session (null when anonymous). */
export function getUserRole(session: Session | null): string | null {
  if (!session) return null;
  const metadata = session.user.app_metadata as AppMetadata;
  return typeof metadata.role === "string" ? metadata.role : null;
}

/** True when the session belongs to a high-privilege (admin) user. */
export function isAdminSession(session: Session | null): boolean {
  return getUserRole(session) === ADMIN_ROLE;
}

/**
 * The current user's role, or null when there is no active session.
 * Uses `auth.getUser()` so the JWT is re-validated against the auth server
 * rather than trusting the locally cached token.
 */
export async function getCurrentUserRole(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const metadata = data.user?.app_metadata as AppMetadata | undefined;
  return typeof metadata?.role === "string" ? metadata.role : null;
}

/* ── App-wide auth state subscription ─────────────────────────────────── */

type AuthStateListener = (session: Session | null) => void;

let cachedSession: Session | null = null;
const authStateListeners = new Set<AuthStateListener>();
let authSubscription: { unsubscribe: () => void } | null = null;

/** Update the cached session and notify every subscriber. */
function refreshCachedSession(next: Session | null) {
  cachedSession = next;
  authStateListeners.forEach((listener) => listener(next));
}

/**
 * Keep a single `supabase.auth.onAuthStateChange` subscription for the whole
 * app (started lazily on first use) so every view shares one source of truth
 * instead of registering competing listeners. Replays the current session
 * immediately on subscribe, so views never miss a state transition.
 *
 * Returns an unsubscribe function for the calling view.
 */
export function onAuthStateChange(listener: AuthStateListener): () => void {
  authStateListeners.add(listener);
  if (!authSubscription && supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      refreshCachedSession(session);
    });
    authSubscription = data.subscription;
  }
  /* Replay the latest known session so late subscribers converge instantly. */
  listener(cachedSession);
  return () => {
    authStateListeners.delete(listener);
  };
}

/** The latest known session, or null when signed out / not yet resolved. */
export function getCachedSession(): Session | null {
  return cachedSession;
}

/**
 * Detect PostgREST permission failures (HTTP 403 / RLS violations) so the UI
 * can surface a human-readable "access denied" message instead of a raw code.
 */
export function isPermissionDenied(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42501" || // insufficient_privilege (RLS / GRANT)
    code === "PGRST301" || // postgrest permission denied
    error.status === 403 ||
    /permission denied|row-level security|not authorized|violates row-level security/i.test(message)
  );
}
