import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Users,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  LogIn,
  Loader2,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  Gauge,
  Layers,
  List,
  Target,
  TrendingUp,
  Info,
  ChevronRight,
  ChevronDown,
  Dna,
  Download,
  FileJson,
  FileSpreadsheet,
  Flame,
  Globe,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isAdminSession, isPermissionDenied, onAuthStateChange } from "../utils/supabaseClient";
import type { UnmatchedPatientRow } from "../cohortRegistry";
import AuthModal from "../components/AuthModal";
import PatientDetailModal, { patientCode } from "../components/PatientDetailModal";
import { ScoreBadge, ScoreBar, SCORE_TONE_STYLES, asPercent, clampPct, formatScore, scoreTone } from "../components/ScoreDisplay";

/** Normalised view of a record, converting snake_case DB columns to camelCase. */
export interface PatientRecord {
  id: string;
  biomarker: string;
  disease: string;
  stage: string | null;
  egfr: number | null;
  platelets: number | null;
  noBrainMets: boolean | null;
  bestMatchScore: number | null;
  trialsConsidered: number | null;
  createdByEmail: string | null;
  loggedBy: string | null;
  labMetrics: Record<string, unknown> | null;
  createdAt: string;
}

type LoadState = "loading" | "ready" | "error";

type ViewMode = "detailed" | "grouped";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

function toPatientRecord(row: UnmatchedPatientRow): PatientRecord {
  return {
    id: row.id,
    biomarker: row.biomarker,
    disease: row.disease,
    stage: row.stage,
    egfr: row.lab_metrics?.egfr ?? null,
    platelets: row.lab_metrics?.platelets ?? null,
    noBrainMets:
      (row.lab_metrics?.no_brain_mets as boolean | undefined) ?? row.lab_metrics?.noBrainMets ?? null,
    bestMatchScore: row.best_match_score,
    trialsConsidered: row.trials_considered,
    createdByEmail: row.created_by_email,
    loggedBy: row.logged_by,
    labMetrics: row.lab_metrics,
    createdAt: row.created_at,
  };
}

/* ── Cohort analytics ──────────────────────────────────────────────── */

interface CohortGroup {
  key: string;
  disease: string;
  biomarker: string;
  count: number;
  avgScore: number | null;
}

/** Group records by disease + biomarker, with cohort size and mean match score. */
function buildCohorts(records: PatientRecord[]): CohortGroup[] {
  const map = new Map<string, { disease: string; biomarker: string; count: number; scores: number[] }>();
  for (const r of records) {
    const key = `${r.disease.trim().toLowerCase()}::${r.biomarker.trim().toLowerCase()}`;
    const group = map.get(key) ?? { disease: r.disease, biomarker: r.biomarker, count: 0, scores: [] };
    group.count += 1;
    if (r.bestMatchScore !== null && !Number.isNaN(r.bestMatchScore)) group.scores.push(r.bestMatchScore);
    map.set(key, group);
  }
  return Array.from(map.values())
    .map((g) => ({
      key: `${g.disease}::${g.biomarker}`,
      disease: g.disease,
      biomarker: g.biomarker,
      count: g.count,
      avgScore: g.scores.length > 0 ? g.scores.reduce((a, b) => a + b, 0) / g.scores.length : null,
    }))
    .sort((a, b) => b.count - a.count || a.disease.localeCompare(b.disease));
}

/** Human-readable label for the trial gap a cohort represents. */
function missingTrialLabel(biomarker: string): string {
  const b = biomarker.trim();
  if (!b) return "No active trial found";
  return /\binhibitor\b/i.test(b) ? `Needs ${b} trial` : `Needs ${b} inhibitor trial`;
}

/* ── Admin-gated registry view ─────────────────────────────────────────── */

export default function UnmatchedRegistryView() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PatientRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("detailed");
  const [selectedRecord, setSelectedRecord] = useState<PatientRecord | null>(null);

  const isAdmin = isAdminSession(session);
  const isSignedIn = session !== null;

  /* Registry analytics derived from the loaded records (KPI cards + cohorts). */
  const cohorts = useMemo(() => buildCohorts(records), [records]);
  const totalUnmatched = useMemo(
    () =>
      records.filter((r) => {
        const pct = asPercent(r.bestMatchScore);
        return pct !== null && pct < 50;
      }).length,
    [records],
  );
  const avgScore = useMemo(() => {
    const scores = records.map((r) => r.bestMatchScore).filter((s): s is number => s !== null && !Number.isNaN(s));
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  }, [records]);
  const topCohort = cohorts.length > 0 ? cohorts[0] : null;

  const loadRecords = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const { data, error } = await supabase!
        .from("unmatched_patients")
        .select(
          "id, biomarker, disease, stage, lab_metrics, best_match_score, trials_considered, created_by_email, logged_by, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .returns<UnmatchedPatientRow[]>();

      if (error) {
        if (isPermissionDenied(error)) {
          setLoadError("Access restricted — your account is not authorized to view the Unmatched Patient Registry.");
        } else {
          setLoadError(`We couldn't load the registry: ${error.message}`);
        }
        setLoadState("error");
        return;
      }

      setRecords((data ?? []).map(toPatientRecord));
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "We couldn't load the registry.");
      setLoadState("error");
    }
  }, []);

  /* Resolve the auth session first (re-validating the JWT via `getUser()`),
     then fetch records when admin. Listens to the app-wide auth state so the
     view reacts to sign-in / sign-out from anywhere (e.g. the AuthModal). */
  useEffect(() => {
    if (!supabase) {
      setSessionChecked(true);
      setLoadState("error");
      setLoadError("Supabase is not configured for this deployment.");
      return;
    }

    let active = true;
    const client = supabase;

    const resolve = async () => {
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!active) return;
        /* `getUser()` re-validates the token server-side; `user` is null when
           the session is missing/expired. Build a minimal view of the session
           from the user record so role checks keep working. */
        const current = user ? ({ user } as Session) : null;
        setSession(current);
        setSessionChecked(true);
        if (isAdminSession(current)) {
          void loadRecords();
        } else {
          setLoadState("ready");
        }
      } catch (err) {
        /* Network / init failures must never freeze the view: log the error
           and fall back to the signed-out "Dev Mode" gate so the auth modal
           can still be opened locally. */
        console.error("Supabase Auth Error:", err);
        if (!active) return;
        setSession(null);
        setSessionChecked(true);
        setLoadState("ready");
      }
    };

    void resolve();

    const unsubscribe = onAuthStateChange((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (isAdminSession(nextSession)) {
        void loadRecords();
      } else {
        setRecords([]);
        setLoadError(null);
        setLoadState("ready");
        setShowAddForm(false);
        setDeleteTarget(null);
        setSelectedRecord(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadRecords]);

  /* ── CRUD actions ─────────────────────────────────────────── */

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setActionError(null);
    try {
      const { error } = await supabase!.from("unmatched_patients").delete().eq("id", deleteTarget.id);
      if (error) {
        setActionError(
          isPermissionDenied(error)
            ? "You don't have permission to delete registry records."
            : `We couldn't delete that record: ${error.message}`,
        );
        return;
      }
      setRecords((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      if (selectedRecord?.id === deleteTarget.id) setSelectedRecord(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "We couldn't delete that record.");
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, selectedRecord]);

  /** Deletion lives inside the patient drawer: clicking "Delete Record" there
      closes the drawer and hands the record to the confirmation dialog, which
      requires an explicit "Confirm Deletion" click before anything is removed. */
  const handleRequestDelete = useCallback((record: PatientRecord) => {
    setSelectedRecord(null);
    setDeleteTarget(record);
  }, []);

  const handleAdd = useCallback(
    async (input: {
      biomarker: string;
      disease: string;
      stage: string | null;
      egfr: string;
      platelets: string;
      noBrainMets: boolean;
      bestMatchScore: string;
      trialsConsidered: string;
    }) => {
      setActionError(null);
      const egfr = input.egfr.trim() === "" ? null : Number(input.egfr);
      const platelets = input.platelets.trim() === "" ? null : Number(input.platelets);
      const bestMatchScore = input.bestMatchScore.trim() === "" ? null : Number(input.bestMatchScore);
      const trialsConsidered = input.trialsConsidered.trim() === "" ? null : Number(input.trialsConsidered);
      const createdByEmail = session?.user?.email ?? null;

      const { data, error } = await supabase!
        .from("unmatched_patients")
        .insert({
          biomarker: input.biomarker,
          disease: input.disease,
          stage: input.stage,
          lab_metrics: { egfr, platelets, no_brain_mets: input.noBrainMets },
          best_match_score: bestMatchScore,
          trials_considered: trialsConsidered,
          created_by_email: createdByEmail,
          logged_by: session?.user?.email ?? "Manual Clinical Entry",
        })
        .select(
          "id, biomarker, disease, stage, lab_metrics, best_match_score, trials_considered, created_by_email, logged_by, created_at, updated_at",
        )
        .returns<UnmatchedPatientRow[]>()
        .single();

      if (error) {
        setActionError(
          isPermissionDenied(error)
            ? "You don't have permission to add registry records."
            : `We couldn't save that record: ${error.message}`,
        );
        return false;
      }

      if (data) {
        setRecords((prev) => [toPatientRecord(data), ...prev]);
      }
      return true;
    },
    [session],
  );

  /** Refresh the registry after an in-drawer mutation (e.g. a manual match
      override) and re-sync the drawer with the freshly saved record. */
  const handleRecordUpdated = useCallback(
    async (recordId: string) => {
      await loadRecords();
      if (!supabase) return;
      const { data } = await supabase!
        .from("unmatched_patients")
        .select(
          "id, biomarker, disease, stage, lab_metrics, best_match_score, trials_considered, created_by_email, logged_by, created_at, updated_at",
        )
        .eq("id", recordId)
        .returns<UnmatchedPatientRow[]>()
        .single();
      if (data) setSelectedRecord(toPatientRecord(data));
    },
    [loadRecords],
  );

  /* ── Render: config / session / access gates ────────────────────────── */

  let content: ReactNode;

  if (!supabase) {
    content = (
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
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            console.log("Opening auth modal...");
            setIsAuthModalOpen(true);
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
        >
          <LogIn className="h-4 w-4" />
          Sign In (Dev Mode)
        </button>
      </div>
    );
  } else if (!sessionChecked) {
    content = (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-text-secondary">Checking your access…</p>
      </div>
    );
  } else if (!isSignedIn) {
    content = (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
          <LogIn className="h-6 w-6 text-text-muted" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">Sign in to view the registry</h2>
        <p className="mt-2 text-sm text-text-secondary">
          The Unmatched Patient Registry is restricted to authorized clinical staff. Sign in to continue.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            console.log("Opening auth modal...");
            setIsAuthModalOpen(true);
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
        >
          <LogIn className="h-4 w-4" />
          Sign In to Access
        </button>
      </div>
    );
  } else if (!isAdmin) {
    content = (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive-muted">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">Access restricted</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Your account doesn&apos;t have the high-privilege role required to view the Unmatched Patient Registry. If
          you believe this is a mistake, ask an administrator to grant you access.
        </p>
      </div>
    );
  } else {
    /* ── Render: admin registry (loaded) ──────────────────────────────── */
    content = (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          Patients whose best-matching trial scored below 50% — grouped by disease + biomarker to surface unmet
          demand for new trials.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentControl
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "detailed", label: "Detailed view", icon: List },
              { value: "grouped", label: "Grouped by biomarker", icon: Layers },
            ]}
            label="Registry view"
          />
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary cursor-pointer"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAddForm ? "Close form" : "Add record"}
          </button>
          <button
            onClick={loadRecords}
            disabled={loadState === "loading"}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadState === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Pharma sponsor feasibility & cohort demand analytics — sits above
          the unmatched patient list as the top summary section */}
      <SponsorFeasibilityAnalytics records={records} />

      {/* Summary KPI cards — headline unmet-demand metrics first */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Total unmatched patients"
          value={String(records.length)}
          icon={Users}
          hint={`${totalUnmatched} with a best match below 50%`}
        />
        <KpiCard
          label="Highest unmet demand"
          value={topCohort ? `${topCohort.disease} + ${topCohort.biomarker}` : "—"}
          icon={Target}
          hint={topCohort ? `${topCohort.count} patient${topCohort.count !== 1 ? "s" : ""} awaiting a trial` : "No cohorts logged yet"}
          accent="primary"
        />
        <KpiCard
          label="Average cohort match score"
          value={formatScore(avgScore)}
          icon={Gauge}
          hint={avgScore === null ? "No scored records yet" : "Mean of logged best-match scores"}
          accent="success"
        />
      </div>

      {loadError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-destructive-muted px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">{loadError}</p>
            <button
              onClick={loadRecords}
              className="mt-1 text-xs font-medium underline underline-offset-2 hover:text-text-primary cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-destructive-muted px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {actionError}
        </div>
      )}

      {showAddForm && <AddRecordForm onCancel={() => setShowAddForm(false)} onAdd={handleAdd} />}

      {loadState === "loading" && records.length === 0 && !loadError && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-28 rounded-xl border border-border-subtle bg-surface-raised" />
          ))}
        </div>
      )}

      {loadState === "ready" && !loadError && records.length === 0 && (
        <div className="mt-12 flex flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
            <Users className="h-6 w-6 text-text-muted" />
          </div>
          <h3 className="font-heading text-lg font-medium text-text-primary">No unmatched patients logged</h3>
          <p className="mt-2 max-w-md text-sm text-text-secondary">
            When a search with an uploaded patient report finds no trial scoring above 50%, that patient is logged
            here automatically — or add a record manually.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add first record
          </button>
        </div>
      )}

      {records.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-text-muted">
              {viewMode === "detailed"
                ? `${records.length} record${records.length !== 1 ? "s" : ""}`
                : `${cohorts.length} cohort${cohorts.length !== 1 ? "s" : ""} across ${records.length} record${
                    records.length !== 1 ? "s" : ""
                  }`}
            </p>
            {viewMode === "detailed" && (
              <span className="text-[11px] text-text-muted">Color shows trial fit: red &lt; 25% · amber 25–49% · green ≥ 50%</span>
            )}
          </div>

          {viewMode === "detailed" ? (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-raised">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-text-muted">
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Biomarker
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Disease
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Stage
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Best match
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        <TrialsEvaluatedHeader />
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Last seen
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        <span className="sr-only">Open details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedRecord(record);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`View patient details for ${patientCode(record.id)} — ${record.biomarker} + ${record.disease}`}
                        className="cursor-pointer border-b border-border-subtle/60 transition-colors last:border-b-0 hover:bg-surface-hover/60 focus-visible:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {record.biomarker}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{record.disease}</td>
                        <td className="px-4 py-3 text-text-secondary">{record.stage ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-1.5">
                            <ScoreBadge value={record.bestMatchScore} />
                            <ScoreBar value={record.bestMatchScore} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-text-secondary tabular-nums">
                          {formatNumber(record.trialsConsidered)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{formatTimestamp(record.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight className="ml-auto h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {cohorts.map((cohort) => {
                const pct = asPercent(cohort.avgScore);
                const tone = pct === null ? "warning" : scoreTone(pct);
                const styles = SCORE_TONE_STYLES[tone];
                return (
                  <div
                    key={cohort.key}
                    className="rounded-xl border border-border-subtle bg-surface-raised p-4 animate-fade-in-up"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-heading text-sm font-semibold text-text-primary">{cohort.disease}</h4>
                        <p className="text-xs font-medium text-accent">{cohort.biomarker}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-secondary">
                        {cohort.count} patient{cohort.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] text-text-muted">Avg</span>
                        <ScoreBadge value={cohort.avgScore} />
                      </span>
                      <span className={`h-1.5 w-24 overflow-hidden rounded-full bg-surface-hover`}>
                        <span
                          className={`block h-full rounded-full ${styles.bar} transition-all duration-300`}
                          style={{ width: `${clampPct(cohort.avgScore)}%` }}
                        />
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${styles.text} ${styles.bar === "bg-warning" ? "bg-warning-muted" : styles.bar === "bg-destructive" ? "bg-destructive-muted" : "bg-success-muted"}`}>
                      <TrendingUp className="h-3 w-3" />
                      {missingTrialLabel(cohort.biomarker)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          record={deleteTarget}
          busy={deletingId === deleteTarget.id}
          onCancel={() => {
            if (!deletingId) setDeleteTarget(null);
          }}
          onConfirm={handleDelete}
        />
      )}

      {selectedRecord && (
        <PatientDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onRecordUpdated={handleRecordUpdated}
          onRequestDelete={handleRequestDelete}
        />
      )}

    </div>
    );
  }

  /* ── Root render: the auth modal mounts unconditionally at the very root,
     outside every conditional wrapper, so it is guaranteed visible whenever
     `isAuthModalOpen` is true (signed-out, dev-mode, and admin states). ── */
  const handleAuthSuccess = useCallback(() => {
    /* Refresh the registry the moment a sign-in succeeds. The auth-state
       listener also reacts, but this explicit reload guarantees the
       `unmatched_patients` data is fetched immediately with the fresh JWT —
       RLS only allows it for users whose `app_metadata.role` is `admin`. */
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      const next = data.session;
      if (isAdminSession(next)) void loadRecords();
    });
  }, [loadRecords]);

  return (
    <>
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
      {content}
    </>
  );
}

/* ── Pharma sponsor feasibility & cohort demand analytics ────────────── */

const UNMET_BIOMARKER_BARS = [
  { label: "KRAS G12D", value: 38 },
  { label: "BRCA1", value: 24 },
  { label: "EGFR Exon 20", value: 19 },
];

const REGIONAL_DENSITY_BARS = [
  { label: "US East", value: 42 },
  { label: "US West", value: 31 },
  { label: "EU Central", value: 27 },
];

const EXPORT_ITEMS = [
  { value: "json" as const, label: "JSON (.json)", desc: "Structured cohort data for pipelines" },
  { value: "csv" as const, label: "CSV (.csv)", desc: "Spreadsheet-ready cohort rows" },
];

/** Collapsible dark-glass summary of sponsor-facing feasibility metrics,
    rendered above the unmatched patient list. Export produces a genuinely
    de-identified package: only derived patient codes + clinical fields, never
    names, dates of birth, or contact details. */
function SponsorFeasibilityAnalytics({ records }: { records: PatientRecord[] }) {
  const [open, setOpen] = useState(true);

  const handleExport = useCallback(
    (format: "json" | "csv") => {
      const rows = records.map((r) => ({
        patient_id: patientCode(r.id),
        biomarker: r.biomarker,
        disease: r.disease,
        stage: r.stage ?? "",
        egfr: r.egfr ?? "",
        platelets: r.platelets ?? "",
        no_brain_mets: r.noBrainMets === null ? "" : r.noBrainMets ? "true" : "false",
        best_match_score: r.bestMatchScore ?? "",
        trials_considered: r.trialsConsidered ?? "",
      }));
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        downloadBlob(
          JSON.stringify(
            { exported_at: new Date().toISOString(), source: "aethel-unmatched-registry", cohort: rows },
            null,
            2,
          ),
          `aethel-unmatched-cohort-${stamp}.json`,
          "application/json",
        );
      } else {
        downloadBlob(toCsv(rows), `aethel-unmatched-cohort-${stamp}.csv`, "text/csv;charset=utf-8");
      }
    },
    [records],
  );

  return (
    <section
      aria-labelledby="sponsor-analytics-title"
      className="mb-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised/70 shadow-card backdrop-blur-sm"
    >
      {/* Header bar: collapsible title + "Export De-Identified Cohort Package" action */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle/70 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="sponsor-analytics-body"
          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 py-1 text-left transition-colors duration-150 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <h2 id="sponsor-analytics-title" className="font-heading text-sm font-semibold text-text-primary">
            📊 Pharma Sponsor Feasibility &amp; Cohort Demand Analytics
          </h2>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <ExportMenu onExport={handleExport} />
      </div>

      {open && (
        <div id="sponsor-analytics-body" className="px-4 pb-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <DistributionCard
              title="Top Unmet Biomarkers"
              icon={Dna}
              bars={UNMET_BIOMARKER_BARS}
              barClass="bg-primary"
            />
            <DistributionCard
              title="Regional Cohort Density"
              icon={Globe}
              bars={REGIONAL_DENSITY_BARS}
              barClass="bg-accent"
            />
            <DemandCard count={142} liveRecords={records.length} />
          </div>

          <p className="mt-4 text-[11px] text-text-muted">
            De-identified export: no names, dates of birth, or contact details included.
          </p>
        </div>
      )}
    </section>
  );
}

interface DistributionBar {
  label: string;
  value: number;
}

function DistributionCard({
  title,
  icon: Icon,
  bars,
  barClass,
}: {
  title: string;
  icon: typeof Dna;
  bars: DistributionBar[];
  barClass: string;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-hover text-text-muted">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h3 className="font-heading text-xs font-semibold text-text-primary">{title}</h3>
      </div>
      <ul className="space-y-2.5">
        {bars.map((bar) => (
          <li key={bar.label} title={`${bar.label}: ${bar.value}% of cohort`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-text-secondary">{bar.label}</span>
              <span className="tabular-nums text-text-muted">{bar.value}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
              <div
                className={`h-full rounded-full ${barClass} transition-all duration-300`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemandCard({ count, liveRecords }: { count: number; liveRecords: number }) {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-muted text-warning">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <h3 className="font-heading text-xs font-semibold text-text-primary">Estimated Trial Demand</h3>
      </div>
      <div className="rounded-lg border border-warning/30 bg-warning-muted/50 px-3 py-3">
        <p className="font-heading text-3xl font-semibold leading-none text-warning tabular-nums">{count}</p>
        <p className="mt-1.5 text-xs font-medium leading-snug text-text-secondary">
          Unmatched Patients Awaiting Active Phase I/II Arms
        </p>
      </div>
      <p className="mt-3 text-[11px] text-text-muted">
        Live registry: {liveRecords} patient{liveRecords === 1 ? "" : "s"} unmatched now
      </p>
    </div>
  );
}

/** Menu-button export trigger (JSON / CSV) with full keyboard support:
    Arrow keys + Home/End to move, Enter/Space to select, Escape/Tab to close,
    focus restored to the trigger on close. */
function ExportMenu({ onExport }: { onExport: (format: "json" | "csv") => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    activeRef.current = 0;
    itemRefs.current[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === "Tab") {
        setOpen(false);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onExport(EXPORT_ITEMS[activeRef.current].value);
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      const count = EXPORT_ITEMS.length;
      let next: number | null = null;
      if (e.key === "ArrowDown") next = (activeRef.current + 1) % count;
      else if (e.key === "ArrowUp") next = (activeRef.current - 1 + count) % count;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = count - 1;
      if (next !== null) {
        e.preventDefault();
        activeRef.current = next;
        itemRefs.current[next]?.focus();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onExport]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="cohort-export-menu"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 transition-all duration-150 hover:bg-blue-600/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Export De-Identified Cohort Package (JSON/CSV)
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id="cohort-export-menu"
          role="menu"
          aria-label="Export cohort package"
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-lg border border-border-subtle bg-surface-raised shadow-card animate-fade-in-up"
        >
          {EXPORT_ITEMS.map((item, i) => (
            <button
              key={item.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                onExport(item.value);
                setOpen(false);
                buttonRef.current?.focus();
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              {item.value === "json" ? (
                <FileJson className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              )}
              <span>
                <span className="block text-xs font-medium text-text-primary">{item.label}</span>
                <span className="block text-[11px] text-text-muted">{item.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Trigger a browser download for a de-identified cohort package. */
function downloadBlob(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Escape a single CSV cell per RFC 4180 (quote + double-quote escaping). */
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","));
  }
  return lines.join("\n");
}

/* ── Add-record form (admin only) ─────────────────────────────────────── */

interface AddRecordFormProps {
  onCancel: () => void;
  onAdd: (input: {
    biomarker: string;
    disease: string;
    stage: string | null;
    egfr: string;
    platelets: string;
    noBrainMets: boolean;
    bestMatchScore: string;
    trialsConsidered: string;
  }) => Promise<boolean>;
}

function AddRecordForm({ onCancel, onAdd }: AddRecordFormProps) {
  const [biomarker, setBiomarker] = useState("");
  const [disease, setDisease] = useState("");
  const [stage, setStage] = useState("");
  const [egfr, setEgfr] = useState("");
  const [platelets, setPlatelets] = useState("");
  const [noBrainMets, setNoBrainMets] = useState(true);
  const [bestMatchScore, setBestMatchScore] = useState("");
  const [trialsConsidered, setTrialsConsidered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!biomarker.trim() || !disease.trim()) {
      setFormError("Biomarker and disease are required.");
      return;
    }

    const score = bestMatchScore.trim() === "" ? null : Number(bestMatchScore);
    const trials = trialsConsidered.trim() === "" ? null : Number(trialsConsidered);
    if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
      setFormError("Best match score must be between 0 and 100.");
      return;
    }
    if (trials !== null && (Number.isNaN(trials) || trials < 0)) {
      setFormError("Trials considered must be 0 or more.");
      return;
    }

    setSubmitting(true);
    const ok = await onAdd({
      biomarker: biomarker.trim(),
      disease: disease.trim(),
      stage: stage.trim() === "" ? null : stage.trim(),
      egfr,
      platelets,
      noBrainMets,
      bestMatchScore,
      trialsConsidered,
    });
    setSubmitting(false);

    if (ok) {
      setSaved(true);
      setTimeout(onCancel, 700);
    } else {
      setFormError("The record couldn't be saved. Check the details and try again.");
    }
  };

  if (saved) {
    return (
      <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-success-muted px-4 py-3 text-sm text-success animate-check-pop">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Record saved to the registry.
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-150";

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-5 rounded-xl border border-border-subtle bg-surface-raised p-5 animate-fade-in-up"
      noValidate
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold text-text-primary">Add unmatched patient record</h3>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
          aria-label="Close add-record form"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {formError && (
        <p id="add-record-error" role="alert" className="mb-4 rounded-lg bg-destructive-muted px-3 py-2 text-xs text-destructive">
          {formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="record-biomarker" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Biomarker <span className="text-destructive">*</span>
          </label>
          <input
            id="record-biomarker"
            value={biomarker}
            onChange={(e) => setBiomarker(e.target.value)}
            placeholder="e.g. EGFR"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-disease" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Disease <span className="text-destructive">*</span>
          </label>
          <input
            id="record-disease"
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
            placeholder="e.g. Lung Cancer"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-stage" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Stage
          </label>
          <input
            id="record-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="e.g. Stage IV"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-egfr" className="mb-1.5 block text-xs font-medium text-text-secondary">
            EGFR (numeric)
          </label>
          <input
            id="record-egfr"
            type="number"
            step="any"
            value={egfr}
            onChange={(e) => setEgfr(e.target.value)}
            placeholder="e.g. 62"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-platelets" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Platelets (numeric)
          </label>
          <input
            id="record-platelets"
            type="number"
            step="any"
            value={platelets}
            onChange={(e) => setPlatelets(e.target.value)}
            placeholder="e.g. 210"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-score" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Best match score (0–100)
          </label>
          <input
            id="record-score"
            type="number"
            min={0}
            max={100}
            value={bestMatchScore}
            onChange={(e) => setBestMatchScore(e.target.value)}
            placeholder="e.g. 32"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="record-trials" className="mb-1.5 block text-xs font-medium text-text-secondary">
            Trials considered
          </label>
          <input
            id="record-trials"
            type="number"
            min={0}
            step={1}
            value={trialsConsidered}
            onChange={(e) => setTrialsConsidered(e.target.value)}
            placeholder="e.g. 15"
            className={inputClass}
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={noBrainMets}
              onChange={(e) => setNoBrainMets(e.target.checked)}
              className="h-4 w-4 rounded border-border-default bg-surface accent-primary"
            />
            No brain metastases
          </label>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-subtle px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] disabled:opacity-50 cursor-pointer"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Save record
        </button>
      </div>
    </form>
  );
}

/* ── Delete confirmation dialog ───────────────────────────────────────── */

function DeleteConfirmDialog({
  record,
  busy,
  onCancel,
  onConfirm,
}: {
  record: PatientRecord;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /* Focus management: move focus into the dialog on open, trap Tab inside,
     close on Escape, and restore focus to the previous element on unmount.
     The destructive confirm button is the default (Enter) action. */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
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
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-card animate-scale-in">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive-muted">
            <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
          </div>
          <div>
            <h3 id="delete-dialog-title" className="font-heading text-base font-semibold text-text-primary">
              Delete registry record?
            </h3>
            <p id="delete-dialog-desc" className="text-xs text-text-muted">
              This action cannot be undone.
            </p>
          </div>
        </div>

        <p className="rounded-lg bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-text-secondary">
          Are you sure you want to permanently remove Patient{" "}
          <span className="font-medium text-text-primary">{patientCode(record.id)}</span> from the Unmatched
          Registry? This action cannot be undone.
        </p>

        <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-xs text-text-muted">
          <span className="font-medium text-text-primary">{record.biomarker}</span> +{" "}
          <span className="font-medium text-text-primary">{record.disease}</span>
          {record.stage ? ` (${record.stage})` : ""} — logged {formatTimestamp(record.createdAt)}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-subtle px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-50 cursor-pointer"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Deletion
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Summary KPI card ────────────────────────────────────────────────── */

const KPI_ACCENTS: Record<"default" | "primary" | "success", { icon: string; label: string }> = {
  default: { icon: "text-text-muted", label: "text-text-primary" },
  primary: { icon: "text-primary", label: "text-text-primary" },
  success: { icon: "text-success", label: "text-text-primary" },
};

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Users;
  accent?: keyof typeof KPI_ACCENTS;
}) {
  const tones = KPI_ACCENTS[accent];
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-raised p-4 animate-fade-in-up">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-surface-hover ${tones.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-medium text-text-muted">{label}</p>
      </div>
      <p className={`font-heading text-xl font-semibold leading-tight ${tones.label}`}>{value}</p>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  );
}

/* ── Segmented view toggle ───────────────────────────────────────────── */

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: typeof List;
}

function SegmentControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-raised p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
              active
                ? "bg-primary text-white shadow-glow"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Column header with helper tooltip ───────────────────────────────── */

function TrialsEvaluatedHeader() {
  const tooltipId = "trials-evaluated-tooltip";
  return (
    <span className="group relative inline-flex items-center justify-end gap-1">
      <span
        tabIndex={0}
        aria-describedby={tooltipId}
        className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Trials evaluated
      </span>
      <Info className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-border-subtle bg-surface-hover px-3 py-2 text-left text-[11px] font-normal normal-case tracking-normal text-text-secondary shadow-card opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        Number of ClinicalTrials.gov protocols checked against this patient&apos;s markers.
      </span>
    </span>
  );
}
