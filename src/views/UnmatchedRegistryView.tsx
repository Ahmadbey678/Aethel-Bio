import { useCallback, useEffect, useState } from "react";
import { Users, RefreshCw, AlertTriangle, Dna } from "lucide-react";
import { fetchUnmatchedCohorts, type AggregatedCohort } from "../cohortRegistry";
import { supabase } from "../utils/supabaseClient";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UnmatchedRegistryView() {
  const [cohorts, setCohorts] = useState<AggregatedCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUnmatchedCohorts();
      setCohorts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the unmatched registry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!supabase) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive-muted">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">Supabase not configured</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Set <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">VITE_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-surface-raised px-1.5 py-0.5 text-xs">VITE_SUPABASE_ANON_KEY</code> to enable
          the Unmatched Patient Registry.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Patients whose best-matching trial scored below 40% — grouped by disease + biomarker to surface unmet
          demand for new trials.
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-destructive-muted px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {loading && cohorts.length === 0 && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-28 rounded-xl border border-border-subtle bg-surface-raised" />
          ))}
        </div>
      )}

      {!loading && !error && cohorts.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
            <Users className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="font-heading text-lg font-medium text-text-primary">No unmatched cohorts logged</h3>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            When a search with an uploaded patient report finds no trial scoring above 40%, that patient is logged
            here automatically.
          </p>
        </div>
      )}

      {cohorts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {cohorts.map((cohort) => (
            <article
              key={cohort.key}
              className="rounded-xl border border-destructive/25 bg-destructive-muted/10 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive-muted">
                  <Dna className="h-4 w-4 text-destructive" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  {cohort.patientCount} Patient{cohort.patientCount !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-sm font-medium leading-snug text-text-primary">
                {cohort.biomarker} + {cohort.disease}
                {cohort.stages.length > 0 && ` (${cohort.stages.join(", ")})`} — No Active Recruiting Trials Found
              </p>
              <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                <span>Avg. best match: {cohort.avgBestScore}%</span>
                <span>Last seen {formatTimestamp(cohort.lastSeen)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
