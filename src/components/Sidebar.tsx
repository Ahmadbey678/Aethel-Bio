import type { ComponentType } from "react";
import {
  Dna,
  FileText,
  Home,
  Loader2,
  LogOut,
  Search,
  Settings as SettingsIcon,
  Target,
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
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              onNavigate(key);
              onCloseMobile();
            }}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 cursor-pointer ${
              active === key
                ? "bg-primary-muted text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
            aria-current={active === key ? "page" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{label}</span>
            {key === "matches" && !!matchCount && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {matchCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-border-subtle px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-muted font-heading text-xs font-semibold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-text-primary">{userEmail ?? "Signed in"}</p>
            <p className="truncate text-[10px] text-text-muted">Precision Oncology Unit</p>
          </div>
          <button
            onClick={onSignOut}
            disabled={signOutPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-destructive-muted hover:text-destructive disabled:opacity-50 cursor-pointer"
            aria-label="Sign out"
            title="Sign out"
          >
            {signOutPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
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