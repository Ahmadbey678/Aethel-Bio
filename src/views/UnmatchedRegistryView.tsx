import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isAdminSession, isPermissionDenied, onAuthStateChange } from "../utils/supabaseClient";
import type { UnmatchedPatientRow } from "../cohortRegistry";
import AuthModal from "../components/AuthModal";

/** Normalised view of a record, converting snake_case DB columns to camelCase. */
interface PatientRecord {
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
  createdAt: string;
}

type LoadState = "loading" | "ready" | "error";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatScore(value: number | null): string {
  return value === null ? "—" : `${value}%`;
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
    noBrainMets: row.lab_metrics?.noBrainMets ?? null,
    bestMatchScore: row.best_match_score,
    trialsConsidered: row.trials_considered,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
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

  const isAdmin = isAdminSession(session);
  const isSignedIn = session !== null;

  const loadRecords = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const { data, error } = await supabase!
        .from("unmatched_patients")
        .select(
          "id, biomarker, disease, stage, lab_metrics, best_match_score, trials_considered, created_by_email, created_at, updated_at",
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "We couldn't delete that record.");
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget]);

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
          lab_metrics: { egfr, platelets, noBrainMets: input.noBrainMets },
          best_match_score: bestMatchScore,
          trials_considered: trialsConsidered,
          created_by_email: createdByEmail,
        })
        .select(
          "id, biomarker, disease, stage, lab_metrics, best_match_score, trials_considered, created_by_email, created_at, updated_at",
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

  /* ── Render: config / session / access gates ────────────────────────── */

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

  if (!sessionChecked) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-text-secondary">Checking your access…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
          <LogIn className="h-6 w-6 text-text-muted" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">Sign in to view the registry</h2>
        <p className="mt-2 text-sm text-text-secondary">
          The Unmatched Patient Registry is restricted to authorized clinical staff. Sign in to continue.
        </p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] cursor-pointer"
        >
          <LogIn className="h-4 w-4" />
          Sign In to Access
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
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
  }

  /* ── Render: admin registry (loaded) ────────────────────────────────── */

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          Patients whose best-matching trial scored below 40% — grouped by disease + biomarker to surface unmet
          demand for new trials.
        </p>
        <div className="flex items-center gap-2">
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
            When a search with an uploaded patient report finds no trial scoring above 40%, that patient is logged
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
          <p className="mb-3 text-xs font-medium text-text-muted">
            {records.length} record{records.length !== 1 ? "s" : ""}
          </p>
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
                      Trials
                    </th>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Last seen
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-border-subtle/60 transition-colors last:border-b-0 hover:bg-surface-hover/40"
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">{record.biomarker}</td>
                      <td className="px-4 py-3 text-text-secondary">{record.disease}</td>
                      <td className="px-4 py-3 text-text-secondary">{record.stage ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">{formatScore(record.bestMatchScore)}</td>
                      <td className="px-4 py-3 text-right text-text-secondary">
                        {formatNumber(record.trialsConsidered)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{formatTimestamp(record.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDeleteTarget(record)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-muted transition-all duration-150 hover:bg-destructive-muted hover:text-destructive cursor-pointer"
                          aria-label={`Delete ${record.biomarker} + ${record.disease} record`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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

      {/* ── Auth modal (signed-out users) ── */}
      {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
    </div>
  );
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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-card animate-scale-in">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive-muted">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 id="delete-dialog-title" className="font-heading text-base font-semibold text-text-primary">
              Delete registry record?
            </h3>
            <p id="delete-dialog-desc" className="text-xs text-text-muted">
              This removes the patient&apos;s unmatched record permanently.
            </p>
          </div>
        </div>

        <p className="rounded-lg bg-surface px-3.5 py-2.5 text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{record.biomarker}</span> +{" "}
          <span className="font-medium text-text-primary">{record.disease}</span>
          {record.stage ? ` (${record.stage})` : ""} — logged{" "}
          {formatTimestamp(record.createdAt)}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border-subtle px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-sm font-medium text-white transition-all duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-50 cursor-pointer"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete record
          </button>
        </div>
      </div>
    </div>
  );
}
