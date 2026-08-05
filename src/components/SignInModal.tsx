import { useEffect, useRef, useState } from "react";
import { X, LogIn, Loader2, AlertTriangle, Eye, EyeOff, Dna } from "lucide-react";
import { supabase } from "../utils/supabaseClient";

/**
 * Email/password sign-in modal backed by Supabase Auth.
 *
 * On a successful sign-in the modal closes; the app's auth-state listeners
 * (e.g. UnmatchedRegistryView) pick up the new session automatically.
 */
export default function SignInModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  /* Focus the email field on open; restore focus to the trigger on close. */
  useEffect(() => {
    emailRef.current?.focus();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  /* Close on Escape (unless a request is in flight). */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  /* Trap Tab / Shift+Tab inside the modal. */
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusables = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal.addEventListener("keydown", handler);
    return () => modal.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address to sign in.");
      return;
    }
    if (!password) {
      setError("Enter your password to sign in.");
      return;
    }

    if (!supabase) {
      setError("Sign-in isn't available right now — Supabase isn't configured for this deployment.");
      return;
    }

    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setSubmitting(false);

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("invalid login credentials")) {
        setError("That email or password didn't match. Double-check and try again.");
      } else if (msg.includes("email not confirmed")) {
        setError("This email hasn't been confirmed yet. Check your inbox for a confirmation link.");
      } else {
        setError("We couldn't sign you in. Please try again.");
      }
      return;
    }

    /* Success — auth listeners react to the new session; close the modal. */
    onClose();
  };

  const inputClass =
    "w-full rounded-lg border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-150";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        aria-describedby={error ? "signin-error" : undefined}
        className="animate-scale-in w-full max-w-md rounded-xl border border-border-subtle bg-surface-raised p-6 shadow-card"
      >
        {/* ── Header ── */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted">
              <Dna className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 id="signin-title" className="font-heading text-base font-semibold text-text-primary">
                Sign in to Aethel Bio
              </h2>
              <p className="text-xs text-text-muted">Authorized clinical staff only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 cursor-pointer"
            aria-label="Close sign-in"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div
            id="signin-error"
            role="alert"
            className="mb-4 flex items-start gap-2.5 rounded-lg bg-destructive-muted px-3.5 py-2.5 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-snug">{error}</p>
          </div>
        )}

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="signin-email" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Email address
            </label>
            <input
              ref={emailRef}
              id="signin-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              placeholder="you@hospital.org"
              aria-invalid={error ? true : undefined}
              className={inputClass}
            />
          </div>

          <div className="mb-5">
            <label htmlFor="signin-password" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Password
            </label>
            <div className="relative">
              <input
                id="signin-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
