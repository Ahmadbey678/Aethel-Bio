import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * `null` when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't configured
 * (e.g. a deploy target that hasn't set the env vars yet), so Supabase-backed
 * features can degrade gracefully instead of crashing the app.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (!supabase) {
  console.warn(
    "Supabase is not configured — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. " +
      "Unmatched Registry persistence will be disabled.",
  );
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

/** The current user's role, or null when there is no active session. */
export async function getCurrentUserRole(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return getUserRole(data.session);
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
