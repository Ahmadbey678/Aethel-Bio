import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Microscope,
  RefreshCw,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  Stethoscope,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import { supabase, isPermissionDenied } from "../utils/supabaseClient";
import { ScoreBadge, ScoreBar, asPercent } from "./ScoreDisplay";

/** Structural view of an unmatched-patient registry record. Declared here so
    the drawer has no runtime dependency back on the registry view (whose
    PatientRecord is structurally identical). */
export interface RegistryRecord {
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

/** Derive a human-friendly patient code from the record id, e.g. PAT-8801. */
export function patientCode(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return `PAT-${tail.padStart(4, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/* ── Match diagnostic engine ─────────────────────────────────────────────
   Explains why the best trial scored below 50% using only the data actually
   logged on the record (lab metrics, stage, CNS status, trials evaluated). */

export type DiagnosticTone = "threshold" | "landscape" | "inclusion" | "exclusion";

export interface MatchDiagnosticItem {
  tone: DiagnosticTone;
  title: string;
  detail: string;
}

const TONE_META: Record<DiagnosticTone, { label: string; chip: string; iconBg: string; iconCls: string }> = {
  threshold: {
    label: "Threshold gap",
    chip: "border-warning/30 bg-warning/10 text-warning",
    iconBg: "bg-warning-muted",
    iconCls: "text-warning",
  },
  landscape: {
    label: "Trial landscape",
    chip: "border-primary/30 bg-primary/10 text-primary",
    iconBg: "bg-primary-muted",
    iconCls: "text-primary",
  },
  inclusion: {
    label: "Inclusion mismatch",
    chip: "border-warning/30 bg-warning/10 text-warning",
    iconBg: "bg-warning-muted",
    iconCls: "text-warning",
  },
  exclusion: {
    label: "Exclusion conflict",
    chip: "border-destructive/30 bg-destructive/10 text-destructive",
    iconBg: "bg-destructive-muted",
    iconCls: "text-destructive",
  },
};

const TONE_ICONS: Record<DiagnosticTone, typeof Activity> = {
  threshold: Activity,
  landscape: SearchX,
  inclusion: UserX,
  exclusion: ShieldAlert,
};

export function buildMatchDiagnostic(record: RegistryRecord): MatchDiagnosticItem[] {
  const items: MatchDiagnosticItem[] = [];
  const pct = asPercent(record.bestMatchScore);
  const bio = record.biomarker.trim();
  const disease = record.disease.trim();

  if (pct !== null) {
    items.push({
      tone: "threshold",
      title: `Best protocol scored ${Math.round(pct)}% — below the 50% bar`,
      detail: "No evaluated protocol reached the 50% match threshold used by the unmatched registry.",
    });
  }

  if (record.trialsConsidered !== null && record.trialsConsidered > 0) {
    items.push({
      tone: "landscape",
      title: `${record.trialsConsidered} protocols evaluated, none cleared the bar`,
      detail:
        bio && disease
          ? `Of the ${record.trialsConsidered} recruiting protocols checked against this patient's markers, none met the threshold for ${bio} in ${disease}.`
          : `Of the ${record.trialsConsidered} recruiting protocols checked against this patient's markers, none met the threshold.`,
    });
  } else {
    items.push({
      tone: "landscape",
      title: bio ? `Thin trial coverage for ${bio}` : "Thin trial coverage",
      detail:
        bio && disease
          ? `Few active protocols target ${bio} in ${disease}; the closest match still scored below the threshold.`
          : "Few active protocols fit this profile; the closest match still scored below the threshold.",
    });
  }

  if (record.noBrainMets === false) {
    items.push({
      tone: "exclusion",
      title: "CNS involvement conflicts with protocol exclusions",
      detail: "Most evaluated protocols exclude patients with brain metastases; this record flags CNS involvement.",
    });
  }

  const stageLower = (record.stage ?? "").toLowerCase();
  if (/\b(iv|4)\b|metastatic/.test(stageLower)) {
    items.push({
      tone: "inclusion",
      title: "Line-of-therapy constraint",
      detail: `Protocols commonly require Line-1 naive status; the recorded stage (${record.stage}) implies a later line with fewer open arms.`,
    });
  }

  if (record.egfr !== null && record.egfr < 50) {
    items.push({
      tone: "inclusion",
      title: "EGFR expression below protocol minimums",
      detail: `Patient EGFR expression is ${record.egfr}%; many protocols require ≥ 50%.`,
    });
  }

  if (record.platelets !== null && record.platelets < 150) {
    items.push({
      tone: "exclusion",
      title: "Platelet count below protocol minimums",
      detail: `Platelets read ${record.platelets} ×10⁹/L; typical protocol minimums sit around 150 ×10⁹/L.`,
    });
  } else if (record.platelets !== null && record.platelets > 450) {
    items.push({
      tone: "exclusion",
      title: "Platelet count above protocol maximums",
      detail: `Platelets read ${record.platelets} ×10⁹/L; typical protocol maximums sit around 450 ×10⁹/L.`,
    });
  }

  return items.slice(0, 5);
}

/* ── Drawer ────────────────────────────────────────────────────────────── */

interface PatientDetailModalProps {
  record: RegistryRecord;
  onClose: () => void;
  /** Called after a manual score override is saved so the parent can refresh
      the registry and re-sync the displayed record. */
  onRecordUpdated: (recordId: string) => void | Promise<void>;
  /** Opens the destructive-confirmation flow for this record. The parent
      closes the drawer and presents the confirm dialog. */
  onRequestDelete?: (record: RegistryRecord) => void;
}

export default function PatientDetailModal({
  record,
  onClose,
  onRecordUpdated,
  onRequestDelete,
}: PatientDetailModalProps) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideScore, setOverrideScore] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSaved, setOverrideSaved] = useState(false);

  const [rerunning, setRerunning] = useState(false);
  const [rerunResult, setRerunResult] = useState<{ count: number | null; error: string | null } | null>(null);

  const pct = asPercent(record.bestMatchScore);
  const diagnostics = useMemo(() => buildMatchDiagnostic(record), [record]);
  /** Merge the record's normalized top-level lab columns (egfr, platelets,
      noBrainMets) with the nested `lab_metrics` JSONB object so every stored
      value renders exactly once. Nested keys win; the top-level fields backfill
      legacy rows that only carry the flat columns. */
  const labEntries = useMemo(() => {
    const nested = record.labMetrics ?? {};
    const merged: Record<string, unknown> = { ...nested };
    if (merged.egfr === undefined && record.egfr !== null) merged.egfr = record.egfr;
    if (merged.platelets === undefined && record.platelets !== null) merged.platelets = record.platelets;
    const hasBrainMets = merged.no_brain_mets !== undefined || merged.noBrainMets !== undefined;
    if (!hasBrainMets && record.noBrainMets !== null) merged.no_brain_mets = record.noBrainMets;
    return Object.entries(merged);
  }, [record]);
  const searchUrl = useMemo(
    () =>
      `https://clinicaltrials.gov/search?cond=${encodeURIComponent(record.disease)}&term=${encodeURIComponent(
        record.biomarker,
      )}&recr=Open`,
    [record.disease, record.biomarker],
  );

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, 280);
  }, [onClose]);

  /* Focus management: trap Tab inside the drawer, close on Escape, lock body
     scroll while open, and restore focus to the trigger on unmount. */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
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

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [handleClose]);

  const handleRerun = useCallback(async () => {
    setRerunning(true);
    setRerunResult(null);
    try {
      const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(
        record.disease,
      )}&query.term=${encodeURIComponent(record.biomarker)}&filter.overallStatus=RECRUITING&pageSize=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setRerunResult({
        count: typeof data.totalCount === "number" ? data.totalCount : (data.studies?.length ?? 0),
        error: null,
      });
    } catch {
      setRerunResult({ count: null, error: "The live check couldn't reach ClinicalTrials.gov — try again." });
    } finally {
      setRerunning(false);
    }
  }, [record.disease, record.biomarker]);

  const handleExport = useCallback(() => {
    const code = patientCode(record.id);
    const lines = [
      "AETHEL BIO — PATIENT DOSSIER",
      "=============================",
      "",
      `Patient code:        ${code}`,
      `Record ID:           ${record.id}`,
      `Disease:             ${record.disease}`,
      `Stage:               ${record.stage ?? "Not logged"}`,
      `Primary biomarker:   ${record.biomarker}`,
      `Secondary biomarker: Not logged`,
      `Best match score:    ${pct === null ? "—" : `${Math.round(pct)}%`}`,
      `Trials evaluated:    ${record.trialsConsidered ?? "—"}`,
      `Logged by:           ${record.loggedBy || "Clinical AI System"}`,
      `Logged on:           ${formatDate(record.createdAt)}`,
      "",
      "LAB METRICS",
      "-----------",
      ...(labEntries.length > 0
        ? labEntries.map(([k, v]) => `${formatLabKey(k)}: ${formatLabValue(k, v)}`)
        : ["None logged"]),
      "",
      "MATCH DIAGNOSTIC",
      "----------------",
      ...diagnostics.map((d) => `- [${TONE_META[d.tone].label}] ${d.title} — ${d.detail}`),
      "",
      `Generated: ${new Date().toLocaleString("en-US")}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aethel-dossier-${code}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [record, pct, diagnostics, labEntries]);

  const handleOverrideSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setOverrideError("Supabase is not configured for this deployment.");
      return;
    }
    const value = Number(overrideScore);
    if (overrideScore.trim() === "" || Number.isNaN(value) || value < 0 || value > 100) {
      setOverrideError("Enter a score between 0 and 100.");
      return;
    }
    setOverrideBusy(true);
    setOverrideError(null);
    const { error } = await supabase.from("unmatched_patients").update({ best_match_score: value }).eq("id", record.id);
    setOverrideBusy(false);
    if (error) {
      setOverrideError(
        isPermissionDenied(error)
          ? "You don't have permission to edit registry records."
          : "We couldn't save the override — try again.",
      );
      return;
    }
    setOverrideSaved(true);
    window.setTimeout(() => {
      setOverrideOpen(false);
      setOverrideSaved(false);
    }, 1200);
    void onRecordUpdated(record.id);
  };

  const overlayAnimClass = closing ? "animate-fade-out" : "animate-fade-in";
  const panelAnimClass = closing ? "animate-slide-out-right" : "animate-slide-in-right";

  return (
    <div className={`fixed inset-0 z-50 ${closing ? "pointer-events-none" : ""}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${overlayAnimClass}`}
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-detail-title"
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border-subtle bg-surface-raised shadow-card outline-none sm:max-w-md ${panelAnimClass}`}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 id="patient-detail-title" className="font-heading text-sm font-semibold text-text-primary">
                Patient dossier
              </h2>
              <p className="truncate text-[11px] text-text-muted">
                {patientCode(record.id)} · {record.disease}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close patient dossier"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-all duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Score hero */}
          <section aria-label="Match score" className="rounded-xl border border-border-subtle bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-text-muted">Best match score</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ScoreBadge value={record.bestMatchScore} />
                  <span className="text-xs text-text-muted">of 100</span>
                </div>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
                <Activity className="h-5 w-5 text-primary" />
              </span>
            </div>
            <ScoreBar value={record.bestMatchScore} className="mt-3.5 h-2 w-full" />
            <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
              {pct === null
                ? "No score logged for this record."
                : pct < 50
                  ? "This patient was logged because their best-matching trial scored below 50%."
                  : "This record now meets the 50% match threshold — it can be removed from the unmatched registry."}
            </p>
          </section>

          {/* Identification */}
          <section aria-labelledby="detail-id-title">
            <SectionHeading icon={FileText} id="detail-id-title">
              Patient identification
            </SectionHeading>
            <dl className="grid grid-cols-2 gap-3">
              <KV
                label="Patient code"
                value={<span className="font-mono text-primary">{patientCode(record.id)}</span>}
              />
              <div className="col-span-2 rounded-lg border border-border-subtle bg-surface px-3 py-2.5">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Record ID</dt>
                <dd className="mt-1">
                  <CopyRecordId id={record.id} />
                </dd>
              </div>
              <KV label="Logged by" value={record.loggedBy || "Clinical AI System"} />
              <KV label="Logged on" value={formatDate(record.createdAt)} />
            </dl>
          </section>

          {/* Clinical profile */}
          <section aria-labelledby="detail-clinical-title">
            <SectionHeading icon={Stethoscope} id="detail-clinical-title">
              Clinical profile
            </SectionHeading>
            <dl className="grid grid-cols-2 gap-3">
              <KV label="Disease" value={record.disease} />
              <KV label="Stage" value={record.stage ?? <span className="text-text-muted">Not logged</span>} />
              <KV
                label="Primary biomarker"
                value={
                  <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    {record.biomarker}
                  </span>
                }
              />
              <KV label="Secondary biomarker" value={<span className="text-text-muted">Not logged</span>} />
            </dl>
          </section>

          {/* Lab metrics breakdown */}
          <section aria-labelledby="detail-lab-title">
            <SectionHeading icon={Microscope} id="detail-lab-title">
              Lab metrics breakdown
            </SectionHeading>
            {labEntries.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {labEntries.map(([key, value]) => (
                  <MetricTile
                    key={key}
                    label={formatLabKey(key)}
                    value={formatLabValue(key, value)}
                    active={!isMissingLabValue(value)}
                    warn={labValueWarn(key, value)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border-subtle bg-surface px-3.5 py-4 text-xs leading-relaxed text-text-muted">
                No lab metrics are logged for this patient yet. Values added to the record&apos;s{" "}
                <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[10px]">lab_metrics</code> field
                will appear here as badges.
              </p>
            )}
          </section>

          {/* Match diagnostic */}
          <section aria-labelledby="detail-diagnostic-title">
            <SectionHeading icon={SearchX} id="detail-diagnostic-title">
              Match diagnostic
            </SectionHeading>
            <ul className="space-y-2.5">
              {diagnostics.map((item, i) => {
                const meta = TONE_META[item.tone];
                const Icon = TONE_ICONS[item.tone];
                return (
                  <li key={i} className="rounded-xl border border-border-subtle bg-surface p-3.5">
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.iconBg}`}>
                        <Icon className={`h-3.5 w-3.5 ${meta.iconCls}`} />
                      </span>
                      <div className="min-w-0">
                        <span
                          className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.chip}`}
                        >
                          {meta.label}
                        </span>
                        <p className="mt-1.5 text-sm font-medium text-text-primary">{item.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.detail}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Footer actions */}
        <footer className="shrink-0 space-y-2.5 border-t border-border-subtle bg-surface p-4">
          {overrideOpen && (
            <form
              onSubmit={handleOverrideSubmit}
              className="rounded-xl border border-border-subtle bg-surface-raised p-3.5"
              noValidate
            >
              <label htmlFor="override-score" className="mb-1.5 block text-xs font-medium text-text-secondary">
                New best match score (0–100)
              </label>
              <input
                id="override-score"
                type="number"
                min={0}
                max={100}
                step="any"
                value={overrideScore}
                onChange={(e) => setOverrideScore(e.target.value)}
                placeholder="e.g. 48"
                autoFocus
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all duration-150"
              />
              {overrideError && (
                <p id="override-error" role="alert" className="mt-2 text-xs text-destructive">
                  {overrideError}
                </p>
              )}
              {overrideSaved && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success animate-check-pop">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Override saved — score updated.
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideOpen(false)}
                  className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-primary-hover active:scale-[0.97] disabled:opacity-50 cursor-pointer"
                >
                  {overrideBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save override
                </button>
              </div>
            </form>
          )}

          {rerunResult && (
            <div
              aria-live="polite"
              className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
                rerunResult.error
                  ? "bg-destructive-muted text-destructive"
                  : (rerunResult.count ?? 0) > 0
                    ? "bg-success-muted text-success"
                    : "bg-warning-muted text-warning"
              }`}
            >
              {rerunResult.error ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (rerunResult.count ?? 0) > 0 ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <div className="min-w-0">
                {rerunResult.error ? (
                  <p>{rerunResult.error}</p>
                ) : (rerunResult.count ?? 0) > 0 ? (
                  <p>
                    Re-ran the query — <strong>{rerunResult.count}</strong> recruiting protocol
                    {rerunResult.count === 1 ? "" : "s"} now listed for {record.biomarker} in {record.disease}.
                  </p>
                ) : (
                  <p>
                    Re-ran the query — still no recruiting protocols for {record.biomarker} in {record.disease}. The
                    gap persists.
                  </p>
                )}
                {(rerunResult.count ?? 0) > 0 && !rerunResult.error && (
                  <a
                    href={searchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-text-primary cursor-pointer"
                  >
                    Open search on ClinicalTrials.gov
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <button
              type="button"
              onClick={handleRerun}
              disabled={rerunning}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {rerunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-run query
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary active:scale-[0.98] cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Export patient dossier
            </button>
            <button
              type="button"
              onClick={() => setOverrideOpen((v) => !v)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.98] cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Manually override match
            </button>
          </div>

          {/* Destructive action — visually separated from the primary actions */}
          <div className="border-t border-border-subtle pt-2.5">
            <button
              type="button"
              onClick={() => onRequestDelete?.(record)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-3.5 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-destructive/40 hover:bg-destructive-muted hover:text-destructive active:scale-[0.98] cursor-pointer"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete Record
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ── Small section primitives ─────────────────────────────────────────── */

function SectionHeading({ icon: Icon, id, children }: { icon: typeof FileText; id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mb-2.5 flex items-center gap-2 font-heading text-xs font-semibold uppercase tracking-wide text-text-muted"
    >
      <Icon className="h-3.5 w-3.5 text-accent" />
      {children}
    </h3>
  );
}

function KV({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-text-primary" title={title}>
        {value}
      </dd>
    </div>
  );
}

/** A lab metric cell: the value renders as a styled badge when logged, or as
    muted "Not logged" text when the record has no value for the field. */
function MetricTile({
  label,
  value,
  active = false,
  warn = false,
}: {
  label: string;
  value: string;
  active?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      {active ? (
        <span
          className={`mt-1 inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums ${
            warn ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/20 bg-primary/10 text-primary"
          }`}
        >
          <span className="truncate">{value}</span>
        </span>
      ) : (
        <p className="mt-1 text-sm text-text-muted">Not logged</p>
      )}
    </div>
  );
}

/* ── Lab metrics rendering ─────────────────────────────────────────────
   The registry stores `lab_metrics` as a free-form JSONB object (the AI
   extraction pipeline may log anything from EGFR to PD-L1 CPS to ECOG).
   Render every key/value pair as a medical attribute chip, with friendly
   labels and units for the fields we know about. */

const LAB_KEY_LABELS: Record<string, string> = {
  egfr: "EGFR expression",
  platelets: "Platelets",
  noBrainMets: "Brain metastases",
  no_brain_mets: "Brain metastases",
  pdl1: "PD-L1",
  pdl1_expression: "PD-L1 expression",
  pdl1_cps: "PD-L1 CPS",
  pd_l1_cps: "PD-L1 CPS",
  tp53: "TP53 status",
  alk: "ALK status",
  tmb: "TMB score",
  tmb_score: "TMB score",
  ecog: "ECOG",
  ecog_score: "ECOG",
  her2: "HER2 status",
  kras: "KRAS status",
  braf: "BRAF status",
  msi: "MSI status",
  msi_status: "MSI status",
};

const LAB_VALUE_UNITS: Record<string, string> = {
  egfr: "%",
  platelets: " ×10⁹/L",
  tmb: " mut/Mb",
  tmb_score: " mut/Mb",
};

function formatLabKey(key: string): string {
  const known = LAB_KEY_LABELS[key];
  if (known) return known;
  return key.replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function isMissingLabValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function formatLabValue(key: string, value: unknown): string {
  if (isMissingLabValue(value)) return "Not logged";
  if (key === "noBrainMets" || key === "no_brain_mets") {
    return typeof value === "boolean" ? (value ? "Absent" : "Present") : String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return `${value}${LAB_VALUE_UNITS[key] ?? ""}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function labValueWarn(key: string, value: unknown): boolean {
  if (key === "noBrainMets" || key === "no_brain_mets") return value === false;
  if (key === "platelets" && typeof value === "number") return value < 150 || value > 450;
  if (key === "egfr" && typeof value === "number") return value < 50;
  return false;
}

/* ── Record ID copy badge ────────────────────────────────────────────── */

function CopyRecordId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        /* Fallback for non-secure contexts where the Clipboard API is absent. */
        const ta = document.createElement("textarea");
        ta.value = id;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked — the hover tooltip still exposes the full ID. */
    }
  };

  return (
    <span className="group relative inline-flex max-w-full">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy record ID ${id}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border-subtle bg-surface-raised px-2 py-1 font-mono text-[11px] text-text-secondary transition-all duration-150 hover:border-primary/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none cursor-pointer"
      >
        <span className="truncate">{shortId(id)}</span>
        {copied ? (
          <CheckCircle2 className="h-3 w-3 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <span className="sr-only" role="status">
          {copied ? "Record ID copied to clipboard." : ""}
        </span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-max max-w-[280px] truncate rounded-md border border-border-subtle bg-surface-hover px-2 py-1 font-mono text-[10px] text-text-secondary shadow-card opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {copied ? "Copied to clipboard" : id}
      </span>
    </span>
  );
}
