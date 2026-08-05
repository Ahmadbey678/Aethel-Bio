import type { ComponentType } from "react";
import {
  Dna,
  FileText,
  Home,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Search,
  Settings as SettingsIcon,
  Target,
  UserRound,
  Users,
  X,
} from "lucide-react";

export type ViewKey = "home" | "queries" | "pathology" | "matches" | "unmatched" | "settings";

export const VIEW_TITLES: Record<ViewKey, string> = {
  home: "Home — Precision Query Builder",
  queries: "Query History",
  pathology: "Pathology Reports",
  matches: "Trial Matches",
  unmatched: "Unmatched Patient Registry",
  settings: "Settings",
};

const NAV_ITEMS: { key: ViewKey; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "queries", label: "Queries", icon: Search },
  { key: "pathology", label: "Pathology", icon: FileText },
  { key: "matches", label: "Matches", icon: Target },
  { key: "unmatched", label: "Unmatched Registry", icon: Users },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

/* Views available to guest (demo) sessions — trial matching workspace only. */
export const GUEST_VIEWS: ViewKey[] = ["home", "matches"];

/* Locked views for guests — kept visible (greyed) so the restriction is
   discoverable, but clicking them surfaces the auth-required toast instead. */
const GUEST_LOCKED_VIEWS: ViewKey[] = ["queries", "pathology", "unmatched", "settings"];

export default function Sidebar({
  active,
  onNavigate,
  matchCount,
  mobileOpen,
  onCloseMobile,
  userEmail,
  signOutPending,
  signOutError,
  onSignOut,
  isGuest = false,
  onGuestLockedClick,
}: {
  active: ViewKey;
  onNavigate: (view: ViewKey) => void;
  matchCount?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userEmail?: string | null;
  signOutPending?: boolean;
  signOutError?: string | null;
  onSignOut?: () => void;
  isGuest?: boolean;
  onGuestLockedClick?: (view: ViewKey) => void;
}) {
  const initials = userEmail ? userEmail.split("@")[0].slice(0, 2).toUpperCase() : "AB";
  const content = (
    <>
      <div className="flex items-center justify-between gap-2.5 border-b border-border-subtle px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-muted">
            <Dna className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <p className="font-heading text-sm font-semibold leading-tight text-text-primary">Aethel Bio</p>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Precision Oncology Unit</p>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary lg:hidden cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const locked = isGuest && GUEST_LOCKED_VIEWS.includes(key);
          return (
            <button
              key={key}
              onClick={() => {
                if (locked) {
                  onGuestLockedClick?.(key);
                } else {
                  onNavigate(key);
                }
                onCloseMobile();
              }}
              aria-disabled={locked ? true : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer ${
                locked
                  ? "text-text-muted/60 hover:bg-surface-hover"
                  : active === key
                    ? "bg-primary-muted text-primary"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              }`}
              aria-current={active === key ? "page" : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {locked && <Lock className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />}
              {!locked && key === "matches" && !!matchCount && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {matchCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle px-3 py-3">
        {isGuest ? (
          /* ── Guest (Demo Mode) badge ── */
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-muted">
              <UserRound className="h-4 w-4 text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text-primary">Guest User</p>
              <p className="truncate text-[10px] font-medium text-warning">Demo Mode</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted font-heading text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-text-primary">{userEmail ?? "Signed in"}</p>
              <p className="truncate text-[10px] text-text-muted">Precision Oncology Unit</p>
            </div>
          </div>
        )}
        <button
          onClick={onSignOut}
          disabled={signOutPending}
          className={`mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 ${
            isGuest
              ? "border-border-subtle bg-surface-raised text-text-secondary hover:text-text-primary"
              : "border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white"
          }`}
          aria-label={isGuest ? "Sign in or exit guest mode" : "Sign out"}
        >
          {signOutPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isGuest ? (
            <LogIn aria-hidden="true" className="h-4 w-4" />
          ) : (
            <LogOut aria-hidden="true" className="h-4 w-4" />
          )}
          <span>
            {signOutPending
              ? "Signing out…"
              : isGuest
                ? "Sign In / Exit Guest Mode"
                : "Sign Out"}
          </span>
        </button>
        {signOutError && (
          <p role="alert" className="mt-2 text-[10px] text-destructive">
            {signOutError}
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-border-subtle bg-footer lg:flex">
        {content}
      </aside>

      {/* Mobile: slide-over drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onCloseMobile}
          />
          <aside className="animate-fade-in fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border-subtle bg-footer lg:hidden">
            {content}
          </aside>
        </>
      )}
    </>
  );
}