import { Search, AlertCircle, MapPin, ArrowRight } from "lucide-react";
import type { TrialCardData } from "../types";

function SkeletonCard() {
  return (
    <div className="animate-shimmer rounded-xl border border-border-subtle bg-surface-raised p-5">
      <div className="mb-3 h-3 w-28 rounded bg-surface-hover" />
      <div className="mb-4 h-4 w-full rounded bg-surface-hover" />
      <div className="mb-4 h-4 w-3/4 rounded bg-surface-hover" />
      <div className="mb-2 flex gap-2">
        <div className="h-5 w-20 rounded-full bg-surface-hover" />
        <div className="h-5 w-24 rounded-full bg-surface-hover" />
      </div>
      <div className="mb-1 h-3 w-40 rounded bg-surface-hover" />
      <div className="h-3 w-48 rounded bg-surface-hover" />
    </div>
  );
}

function TrialCard({
  trial,
  index,
  onSelect,
}: {
  trial: TrialCardData;
  index: number;
  onSelect: (nctId: string) => void;
}) {
  return (
    <article
      className="animate-fade-in-up group relative rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-card transition-all duration-200 ease-out hover:border-border-default hover:shadow-card-hover hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs font-medium text-primary">{trial.nctId}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {trial.overallStatus}
        </span>
      </div>

      <h3 className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-text-primary">{trial.briefTitle}</h3>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border-subtle bg-surface px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {trial.phase}
        </span>
        {trial.conditions && trial.conditions.length > 0 && (
          <span className="text-xs text-text-muted line-clamp-1">
            {trial.conditions.slice(0, 2).join(", ")}
            {trial.conditions.length > 2 && " …"}
          </span>
        )}
      </div>

      <div className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary">
        <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        {trial.leadSponsor}
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-xs text-text-muted">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        {trial.primaryLocation}
      </div>

      <button
        onClick={() => onSelect(trial.nctId)}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-primary-muted px-4 py-2.5 text-sm font-medium text-primary transition-all duration-150 ease-out hover:bg-primary hover:text-white active:scale-[0.98] cursor-pointer"
      >
        Select Trial to Analyze
        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </article>
  );
}

export default function MatchesView({
  loading,
  trials,
  searched,
  error,
  onDismissError,
  onSelectTrial,
}: {
  loading: boolean;
  trials: TrialCardData[];
  searched: boolean;
  error: string | null;
  onDismissError: () => void;
  onSelectTrial: (nctId: string) => void;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {error && (
        <div className="mx-auto mb-6 flex max-w-2xl items-center gap-3 rounded-xl bg-destructive-muted px-5 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            onClick={onDismissError}
            className="ml-auto text-xs font-medium underline-offset-2 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && trials.length > 0 && (
        <>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-text-primary">Recruiting Trials</h2>
            <span className="text-xs text-text-muted">
              {trials.length} result{trials.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {trials.map((trial, i) => (
              <TrialCard key={trial.nctId} trial={trial} index={i} onSelect={onSelectTrial} />
            ))}
          </div>
        </>
      )}

      {!loading && searched && trials.length === 0 && !error && (
        <div className="mt-12 flex flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
            <Search className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="font-heading text-lg font-medium text-text-primary">No recruiting trials found</h3>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            Try broadening your search terms, using a different biomarker, or checking the condition name. If a
            patient report was uploaded, this search has been logged to the Unmatched Registry.
          </p>
        </div>
      )}

      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center px-4 py-24 text-center sm:py-32">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted">
            <Search className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-heading text-2xl font-semibold text-text-primary sm:text-3xl">No search run yet</h2>
          <p className="mt-3 max-w-lg text-base text-text-secondary">
            Run a query from the Home view to see matching recruiting trials here.
          </p>
        </div>
      )}
    </div>
  );
}
