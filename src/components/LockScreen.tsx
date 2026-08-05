import { Dna, LogIn } from "lucide-react";

/**
 * Full-screen "locked" gate shown when there is no authenticated session.
 *
 * Rendered by App.tsx in place of the workspace whenever the user signs out
 * (or arrives without a session). Signing back in via the hosted AuthModal
 * restores the workspace; the app-wide auth listener picks up the new session
 * automatically.
 */
export default function LockScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm animate-fade-in-up text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted">
          <Dna className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-heading text-xl font-semibold text-text-primary">Aethel Bio</h1>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-text-muted">Precision Oncology Unit</p>

        <div className="mt-8 rounded-xl border border-border-subtle bg-surface-raised p-6 shadow-card">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface">
            <LogIn className="h-5 w-5 text-text-muted" />
          </div>
          <h2 className="font-heading text-base font-semibold text-text-primary">Sign in to continue</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">
            Authorized clinical staff only. Sign in to access the clinical trial workspace.
          </p>
          <button
            onClick={onSignIn}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
        </div>

        <p className="mt-5 text-[11px] text-text-muted">Connected to ClinicalTrials.gov</p>
      </div>
    </div>
  );
}
