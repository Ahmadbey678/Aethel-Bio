import { useEffect, useRef, useState } from "react";
import {
  X,
  LogIn,
  UserPlus,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  Dna,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";

type AuthTab = "signin" | "signup";

const TABS: AuthTab[] = ["signin", "signup"];

/**
 * Email/password authentication modal (Sign In + Create Account tabs) backed
 * by Supabase Auth.
 *
 * On a successful sign-in (or a sign-up when email confirmation is disabled)
 * the modal closes; the app's auth-state listeners (e.g. UnmatchedRegistryView)
 * pick up the new session and re-fetch automatically. When email confirmation
 * is required (the hosted Supabase default), the modal shows a "check your
 * inbox" success state with a resend option instead.
 */
export default function AuthModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<AuthTab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const successTitleRef = useRef<HTMLHeadingElement>(null);

  /* Focus the email field on open; restore focus to the trigger on close. */
  useEffect(() => {
    emailRef.current?.focus();
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  /* When the confirmation-email success state appears, move focus to it so
     keyboard users don't lose their place (the submit button just unmounted). */
  useEffect(() => {
    if (confirmationPending) {
      successTitleRef.current?.focus();
    }
  }, [confirmationPending]);

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

  const switchTab = (next: AuthTab) => {
    if (next === tab) return;
    setTab(next);
    setError(null);
    setConfirmationPending(false);
    setResendSent(false);
    /* Click path — move straight to the email field. */
    requestAnimationFrame(() => emailRef.current?.focus());
  };

  /* Arrow-key navigation between the Sign In / Create Account tabs. */
  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const index = TABS.indexOf(tab);
    let nextIndex = index;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    setTab(TABS[nextIndex]);
    setError(null);
    setConfirmationPending(false);
    setResendSent(false);
    /* Keyboard path — keep focus on the newly selected tab. */
    tabRefs.current[nextIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError(
        tab === "signin"
          ? "Enter your email address to sign in."
          : "Enter your email address to create an account.",
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    if (!password) {
      setError(tab === "signin" ? "Enter your password to sign in." : "Choose a password for your account.");
      return;
    }
    if (tab === "signup" && password.length < 6) {
      setError("Your password needs to be at least 6 characters long.");
      return;
    }
    if (!supabase) {
      setError("Authentication isn't available right now — Supabase isn't configured for this deployment.");
      return;
    }

    setSubmitting(true);

    if (tab === "signin") {
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

      /* Success — auth listeners react to the new session and re-fetch. */
      onClose();
      return;
    }

    /* Sign up. Hosted Supabase requires email confirmation by default, so
       expect `data.session === null` in the common case. */
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setSubmitting(false);

    if (signUpError) {
      const msg = signUpError.message.toLowerCase();
      const code = (signUpError as { code?: string }).code ?? "";
      if (
        msg.includes("already registered") ||
        msg.includes("already exists") ||
        code === "user_already_exists" ||
        code === "email_exists"
      ) {
        setError("An account with this email already exists — switch to Sign In and use your password.");
      } else {
        setError("We couldn't create your account. Please try again.");
      }
      return;
    }

    if (data.session) {
      /* Email confirmation is disabled for this project — session is live. */
      onClose();
    } else {
      setConfirmationPending(true);
    }
  };

  const handleResend = async () => {
    if (!supabase || !email.trim()) return;
    setResendSent(false);
    setError(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (resendError) {
      setError("We couldn't resend the confirmation email. Please try again.");
    } else {
      setResendSent(true);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-150";

  const tabButtonClass = (active: boolean) =>
    `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-150 cursor-pointer ${
      active ? "bg-surface-raised text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-describedby={error ? "auth-modal-error" : undefined}
        className="animate-scale-in w-full max-w-md rounded-xl border border-border-subtle bg-surface-raised p-6 shadow-card"
      >
        {/* ── Header ── */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted">
              <Dna className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 id="auth-modal-title" className="font-heading text-base font-semibold text-text-primary">
                {tab === "signin" ? "Sign in to Aethel Bio" : "Create your account"}
              </h2>
              <p className="text-xs text-text-muted">Authorized clinical staff only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Sign In / Create Account tabs ── */}
        <div
          role="tablist"
          aria-label="Account access"
          onKeyDown={handleTablistKeyDown}
          className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1"
        >
          <button
            ref={(el) => {
              tabRefs.current[0] = el;
            }}
            role="tab"
            id="auth-tab-signin"
            aria-selected={tab === "signin"}
            aria-controls="auth-panel"
            tabIndex={tab === "signin" ? 0 : -1}
            onClick={() => switchTab("signin")}
            disabled={submitting}
            className={tabButtonClass(tab === "signin")}
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </button>
          <button
            ref={(el) => {
              tabRefs.current[1] = el;
            }}
            role="tab"
            id="auth-tab-signup"
            aria-selected={tab === "signup"}
            aria-controls="auth-panel"
            tabIndex={tab === "signup" ? 0 : -1}
            onClick={() => switchTab("signup")}
            disabled={submitting}
            className={tabButtonClass(tab === "signup")}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Create Account
          </button>
        </div>

        <div role="tabpanel" id="auth-panel" aria-labelledby={`auth-tab-${tab}`}>
          {/* ── Error banner ── */}
          {error && (
            <div
              id="auth-modal-error"
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-lg bg-destructive-muted px-3.5 py-2.5 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          {confirmationPending ? (
            /* ── Confirmation-email success state ── */
            <div className="flex flex-col items-center px-2 py-4 text-center animate-fade-in-up">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-muted">
                <MailCheck className="h-7 w-7 text-success" />
              </div>
              <h3
                ref={successTitleRef}
                tabIndex={-1}
                className="font-heading text-base font-semibold text-text-primary focus:outline-none"
              >
                Confirm your email
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-secondary">
                We sent a confirmation link to <span className="font-medium text-text-primary">{email.trim()}</span>.
                Click it to activate your account, then come back and sign in.
              </p>
              <div className="mt-5 flex flex-col items-center gap-3">
                <button
                  onClick={handleResend}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Resend confirmation email
                </button>
                {resendSent && (
                  <p className="text-xs font-medium text-success" role="status">
                    Sent — check your inbox.
                  </p>
                )}
                <button
                  onClick={() => switchTab("signin")}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              </div>
            </div>
          ) : (
            /* ── Sign In / Sign Up form ── */
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Email address
                </label>
                <input
                  ref={emailRef}
                  id="auth-email"
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
                <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-text-secondary">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
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
                {tab === "signup" && <p className="mt-1.5 text-xs text-text-muted">At least 6 characters.</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {tab === "signin" ? "Signing in…" : "Creating account…"}
                  </>
                ) : tab === "signin" ? (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Create Account
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
