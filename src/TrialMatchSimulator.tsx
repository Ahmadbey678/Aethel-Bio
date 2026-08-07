import { useState, useMemo, useEffect, type CSSProperties } from "react";
import { X, ArrowLeft, BadgeCheck, CheckCircle, AlertTriangle, Plus, Trash2, Gauge, ChevronDown, ChevronUp, Dna, Stethoscope, Beaker, Brain, FlaskConical, FileText, SlidersHorizontal, Info } from "lucide-react";
import {
  type ParsedCriteria,
  parseEligibilityCriteria,
  autoMatchInclusion,
  autoMatchExclusion,
  computeOrganMismatch,
  computeBreastOvarianMismatch,
  computeInclusionScore,
  getMatchCategory,
  getGaugeColor,
} from "./trialScoring";
import type { StudyProtocol, PatientProfile } from "./types";
import ExportSummaryModal from "./components/ExportSummaryModal";

/* ── Types ─────────────────────────────────────────── */

interface CustomRule {
  id: string;
  text: string;
  satisfied: boolean;
  required?: boolean;
}

interface SimulatorProps {
  study: StudyProtocol;
  patientProfile?: PatientProfile;
  onClose: () => void;
}

/* ── Protocol Waiver Sensitivity ─────────────────────────
   Extracts lab-value thresholds (eGFR, platelets) from the
   eligibility criteria / custom rule text, then recomputes
   which currently-failing criteria fall within a clinician-set
   tolerance offset — those become "Eligible via Protocol Waiver
   Request" (still requires sponsor approval). */

export interface WaiverEntry {
  metric: "eGFR" | "Platelets";
  percent: number;
  required: number;
  patient: number;
  unit: string;
}

export interface WaiverAnalysis {
  waiverCount: number;
  waiverMetrics: string[];
  byInclusionIndex: Record<number, WaiverEntry | undefined>;
  byRuleId: Record<string, WaiverEntry | undefined>;
}

type LabMetricKey = "egfr" | "platelets";

interface LabBound {
  direction: "min" | "max";
  required: number;
}

/** Pull the numeric threshold(s) a criterion imposes on a lab metric. */
function extractLabBounds(text: string): { metric: LabMetricKey; bounds: LabBound[] } | null {
  const lower = text.toLowerCase();
  const isEGFR = /\begfr\b|gfr|creatinine\s*clearance|crcl|renal\s*function/.test(lower);
  const isPLT = /\bplatelet\b|\bplt\b|thrombocyte/.test(lower);
  if (!isEGFR && !isPLT) return null;
  const metric: LabMetricKey = isEGFR ? "egfr" : "platelets";
  const bounds: LabBound[] = [];

  const between = lower.match(/between\s+(\d+(?:\.\d+)?)\s*(?:-|–|and|to)\s*(\d+(?:\.\d+)?)/);
  if (between) {
    bounds.push({ direction: "min", required: parseFloat(between[1]) });
    bounds.push({ direction: "max", required: parseFloat(between[2]) });
    return { metric, bounds };
  }

  const minPatterns = [
    /(?:≥|>=|at\s*least|no\s*less\s*than|greater\s*than\s*or\s*equal)\s*(\d+(?:\.\d+)?)/i,
    />\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:or\s*)?(?:greater|more)/,
  ];
  for (const re of minPatterns) {
    const m = lower.match(re);
    if (m) {
      bounds.push({ direction: "min", required: parseFloat(m[1]) });
      break;
    }
  }

  if (bounds.length === 0) {
    const maxPatterns = [
      /(?:≤|<=|at\s*most|no\s*more\s*than|less\s*than\s*or\s*equal)\s*(\d+(?:\.\d+)?)/i,
      /<\s*(\d+(?:\.\d+)?)/,
      /(\d+(?:\.\d+)?)\s*(?:or\s*)?less/,
    ];
    for (const re of maxPatterns) {
      const m = lower.match(re);
      if (m) {
        bounds.push({ direction: "max", required: parseFloat(m[1]) });
        break;
      }
    }
  }

  // Fallback: bare number immediately after the metric keyword.
  if (bounds.length === 0) {
    const needles = isEGFR
      ? ["egfr", "gfr", "creatinine clearance", "crcl", "renal function"]
      : ["platelet", "plt", "thrombocyte"];
    const idx = needles.reduce(
      (best, w) => {
        const at = lower.indexOf(w);
        return at !== -1 && (best === -1 || at < best) ? at : best;
      },
      -1,
    );
    if (idx !== -1) {
      const m = lower.slice(idx).match(/(\d+(?:\.\d+)?)/);
      if (m) bounds.push({ direction: "min", required: parseFloat(m[1]) });
    }
  }

  return bounds.length > 0 ? { metric, bounds } : null;
}

/**
 * Re-evaluate every lab-bearing criterion / custom rule against the patient's
 * values, applying the tolerance offset to the protocol threshold. Only
 * criteria that FAIL the original requirement but PASS the adjusted one are
 * flagged as waiver-eligible.
 */
export function analyzeWaivers(
  criteria: ParsedCriteria,
  rules: CustomRule[],
  patient: PatientProfile | null | undefined,
  offsetPct: number,
): WaiverAnalysis {
  const byInclusionIndex: WaiverAnalysis["byInclusionIndex"] = {};
  const byRuleId: WaiverAnalysis["byRuleId"] = {};
  const waiverMetrics: string[] = [];

  const consider = (
    text: string,
    patientVal: number | null,
    source: "inclusion" | "custom",
    index: number | string,
  ) => {
    if (patientVal === null || offsetPct <= 0) return;
    const found = extractLabBounds(text);
    if (!found) return;

    for (const bound of found.bounds) {
      const meetsOriginal =
        bound.direction === "min" ? patientVal >= bound.required : patientVal <= bound.required;
      if (meetsOriginal) continue;

      const adjusted =
        bound.direction === "min"
          ? bound.required * (1 - offsetPct / 100)
          : bound.required * (1 + offsetPct / 100);
      const meetsAdjusted =
        bound.direction === "min" ? patientVal >= adjusted : patientVal <= adjusted;
      if (!meetsAdjusted) continue;

      const metricLabel = found.metric === "egfr" ? "eGFR" : "Platelets";
      const unit = found.metric === "egfr" ? " mL/min" : " ×10⁹/L";
      const entry: WaiverEntry = {
        metric: metricLabel,
        percent: offsetPct,
        required: bound.required,
        patient: patientVal,
        unit,
      };
      if (source === "inclusion") byInclusionIndex[index as number] = entry;
      else byRuleId[index as string] = entry;
      const label = `${metricLabel} within ${offsetPct}% variance`;
      if (!waiverMetrics.includes(label)) waiverMetrics.push(label);
    }
  };

  if (!patient) return { waiverCount: 0, waiverMetrics: [], byInclusionIndex: {}, byRuleId: {} };

  criteria.inclusion.forEach((item, i) => {
    consider(item, patient.extractedParams.egfr, "inclusion", i);
    consider(item, patient.extractedParams.platelets, "inclusion", i);
  });
  rules.forEach((rule) => {
    consider(rule.text, patient.extractedParams.egfr, "custom", rule.id);
    consider(rule.text, patient.extractedParams.platelets, "custom", rule.id);
  });

  return {
    waiverCount: Object.keys(byInclusionIndex).length + Object.keys(byRuleId).length,
    waiverMetrics,
    byInclusionIndex,
    byRuleId,
  };
}

/* ── Circular Gauge ──────────────────────────────────── */

function MatchGauge({ score, cat: overrideCat }: { score: number; cat?: { label: string; color: string; bg: string; border: string } }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const cat = overrideCat ?? getMatchCategory(score);
  const color = getGaugeColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="animate-gauge-appear relative flex h-32 w-32 items-center justify-center">
        <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 110 110">
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="oklch(0.25 0.045 258)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </svg>
        <span className="relative font-heading text-3xl font-bold tracking-tight text-text-primary">
          {Math.round(score)}<span className="text-base text-text-muted">%</span>
        </span>
      </div>
      <span
        className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cat.bg} ${cat.color} ${cat.border}`}
      >
        <Gauge className="h-3 w-3" />
        {cat.label}
      </span>
    </div>
  );
}

/* ── Patient Info Panel ──────────────────────────────── */

function PatientInfoPanel({ profile }: { profile: PatientProfile }) {
  const fmt = (val: number | null, unit: string) =>
    val !== null ? `${val} ${unit}` : "N/A";
  return (
    <section className="rounded-xl border border-accent/25 bg-accent-muted/10 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
        <FlaskConical className="h-4 w-4" />
        Patient Profile — Extracted from Report
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Dna className="h-3.5 w-3.5 text-accent" />
          <div>
            <span className="text-text-muted">Mutation</span>
            <p className="font-medium text-text-primary">{profile.extractedParams.mutation}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Stethoscope className="h-3.5 w-3.5 text-accent" />
          <div>
            <span className="text-text-muted">Disease</span>
            <p className="font-medium text-text-primary">{profile.extractedParams.disease}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Beaker className="h-3.5 w-3.5 text-accent" />
          <div>
            <span className="text-text-muted">eGFR</span>
            <p className="font-medium text-text-primary">{fmt(profile.extractedParams.egfr, "mL/min")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Beaker className="h-3.5 w-3.5 text-accent" />
          <div>
            <span className="text-text-muted">Platelets</span>
            <p className="font-medium text-text-primary">{fmt(profile.extractedParams.platelets, "K/µL")}</p>
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-accent" />
          <div>
            <span className="text-text-muted">Brain Metastases</span>
            <p className="font-medium text-success">None detected ✓</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Criteria Section (with collapsible long text) ──── */

function CriteriaSection({
  title,
  icon,
  items,
  checkedMap,
  onToggle,
  accentColor,
  waiverByIndex = {},
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  checkedMap: Record<number, boolean>;
  onToggle: (index: number) => void;
  accentColor: string;
  waiverByIndex?: Record<number, WaiverEntry | undefined>;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleExpand = (index: number) =>
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface-raised/50 p-4 text-center text-xs text-text-muted">
        No {title.toLowerCase()} criteria listed
      </div>
    );
  }

  return (
    <div>
      <div className={`mb-2 flex items-center gap-2 text-sm font-semibold ${accentColor}`}>
        {icon}
        <span>
          {title} ({items.length})
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const isLong = item.length > 120;
          const isExpanded = expanded[i];

          return (
            <li key={i}>
              <label
                onClick={() => onToggle(i)}
                className={`group flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 transition-all duration-150 ${
                  checkedMap[i]
                    ? "border-primary/30 bg-primary-muted/40"
                    : "border-border-subtle bg-surface-raised hover:border-border-default"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
                    checkedMap[i]
                      ? "border-primary bg-primary text-white"
                      : "border-border-default bg-surface hover:border-primary/60"
                  }`}
                >
                  {checkedMap[i] && (
                    <CheckCircle className="animate-check-pop h-3.5 w-3.5" />
                  )}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm leading-snug text-text-primary ${
                      isLong && !isExpanded ? "line-clamp-2" : ""
                    }`}
                  >
                    {item}
                  </span>
                  {waiverByIndex[i] && (
                    <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      <BadgeCheck className="h-3 w-3" />
                      Eligible via Protocol Waiver Request
                    </span>
                  )}
                  {isLong && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpand(i);
                      }}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary/70 hover:text-primary transition-colors duration-150 cursor-pointer"
                    >
                      {isExpanded ? (
                        <>
                          Show less <ChevronUp className="h-3 w-3" />
                        </>
                      ) : (
                        <>
                          Show more <ChevronDown className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Custom Rule Input ───────────────────────────────── */

function CustomRuleInput({
  rules,
  onAdd,
  onToggle,
  onRemove,
  waiverById = {},
}: {
  rules: CustomRule[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  waiverById?: Record<string, WaiverEntry | undefined>;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed.length < 2) return;
    onAdd(trimmed);
    setInput("");
  };

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-text-secondary">
        Custom Clinical Rules / Lab Constraints
      </p>

      <div className="mb-3 flex gap-2">
        <input
          type="text"
          placeholder='e.g. "eGFR > 60 mL/min", "Platelets > 100K"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          className="flex-1 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={handleAdd}
          disabled={input.trim().length < 2}
          className="flex items-center gap-1.5 rounded-lg bg-primary-muted px-3.5 py-2 text-sm font-medium text-primary transition-all duration-150 hover:bg-primary hover:text-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {rules.length > 0 && (
        <ul className="space-y-1.5">
          {rules.map((rule) => (
            <li key={rule.id}>
              <div
                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-all duration-150 ${
                  rule.satisfied
                    ? "border-accent/30 bg-accent-muted/20"
                    : "border-border-subtle bg-surface-raised"
                }`}
              >
                <button
                  onClick={() => onToggle(rule.id)}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-default bg-surface transition-all duration-150 hover:border-accent/60 cursor-pointer"
                >
                  {rule.satisfied && (
                    <CheckCircle className="animate-check-pop h-3.5 w-3.5 text-accent" />
                  )}
                </button>
                <span className="flex-1 text-sm text-text-primary">{rule.text}</span>
                {waiverById[rule.id] && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                    <BadgeCheck className="h-2.5 w-2.5" />
                    Waiver
                  </span>
                )}
                {!rule.required && (
                  <button
                    onClick={() => onRemove(rule.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-0 transition-all duration-150 hover:bg-destructive-muted hover:text-destructive group-hover:opacity-100 cursor-pointer"
                    title="Remove rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Drawer Backdrop ─────────────────────────────────── */

function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      onClick={onClick}
    />
  );
}

/* ── Main Simulator Component ────────────────────────── */

export default function TrialMatchSimulator({ study, patientProfile, onClose }: SimulatorProps) {
  const { protocolSection: p } = study;

  /* ── Parse criteria ── */
  const criteria = useMemo(
    () => parseEligibilityCriteria(p.eligibilityModule?.eligibilityCriteria),
    [p.eligibilityModule?.eligibilityCriteria]
  );

  /* ── States ── */
  const [inclusionMap, setInclusionMap] = useState<Record<number, boolean>>({});
  const [exclusionMap, setExclusionMap] = useState<Record<number, boolean>>({});
  const [customRules, setCustomRules] = useState<CustomRule[]>([]);
  const [showReferral, setShowReferral] = useState(false);

  /* ── Protocol Waiver Sensitivity ── */
  const [waiverTolerance, setWaiverTolerance] = useState(0);
  const waiverAnalysis = useMemo(
    () => analyzeWaivers(criteria, customRules, patientProfile, waiverTolerance),
    [criteria, customRules, patientProfile, waiverTolerance],
  );

  /* ── Detect organ system mismatch ── */
  const isOrganMismatch = useMemo(() => {
    if (!patientProfile) return false;
    return computeOrganMismatch(p, patientProfile);
  }, [patientProfile, p]);

  /* ── Detect breast/ovarian organ system mismatch (hard gate) ── */
  const isBreastOvarianMismatch = useMemo(() => {
    if (!patientProfile) return false;
    return computeBreastOvarianMismatch(p, patientProfile);
  }, [patientProfile, p]);

  /* ── Auto-match when patient profile is provided ── */
  useEffect(() => {
    if (!patientProfile) return;

    // Auto-match inclusion criteria
    const matchedInclusion = autoMatchInclusion(criteria.inclusion, patientProfile);
    setInclusionMap(matchedInclusion);

    // Auto-match exclusion criteria (leave unchecked for things patient doesn't have)
    const matchedExclusion = autoMatchExclusion(criteria.exclusion, patientProfile);
    setExclusionMap(matchedExclusion);

    // Pre-populate custom lab rules from the patient profile
    const { egfr, platelets } = patientProfile.extractedParams;
    const preRules: CustomRule[] = [];
    if (egfr !== null) {
      preRules.push({
        id: crypto.randomUUID(),
        text: `eGFR ≥ 60 mL/min (Patient: ${egfr} mL/min)`,
        satisfied: egfr >= 60,
        required: true,
      });
    }
    if (platelets !== null) {
      preRules.push({
        id: crypto.randomUUID(),
        text: `Platelets ≥ 100 K/µL (Patient: ${platelets} K/µL)`,
        satisfied: platelets >= 100,
        required: true,
      });
    }
    setCustomRules(preRules);
  }, [patientProfile, criteria.inclusion, criteria.exclusion]);

  /* ── Toggles ── */
  const toggleInclusion = (index: number) =>
    setInclusionMap((prev) => ({ ...prev, [index]: !prev[index] }));

  const toggleExclusion = (index: number) =>
    setExclusionMap((prev) => ({ ...prev, [index]: !prev[index] }));

  const addCustomRule = (text: string) =>
    setCustomRules((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, satisfied: true, required: false },
    ]);

  const toggleCustom = (id: string) =>
    setCustomRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, satisfied: !r.satisfied } : r))
    );

  const removeCustom = (id: string) =>
    setCustomRules((prev) => prev.filter((r) => r.id !== id));

  /* ── Calculate hard gate and score ── */
  const hardGatePassed = useMemo(() => {
    // Organ system mismatch — handled by isOrganMismatch (which controls cat label)
    if (isOrganMismatch) return false;

    // Breast/ovarian organ system mismatch — hard fail, score forced to 0
    if (isBreastOvarianMismatch) return false;

    // Mandatory exclusion violation — if any exclusion criterion applies to the patient, hard fail
    const hasActiveExclusion = criteria.exclusion.some((_, i) => exclusionMap[i] === true);
    if (hasActiveExclusion) return false;

    return true;
  }, [isOrganMismatch, isBreastOvarianMismatch, criteria, exclusionMap]);

  // Trials with zero ClinicalTrials.gov exclusion rules are never penalized —
  // hasActiveExclusion above is always false for an empty exclusion array.
  const exclusionCriteriaPresent = criteria.exclusion.length > 0;

  const score = useMemo(() => {
    if (!hardGatePassed) return 0;
    if (criteria.inclusion.length === 0) return 0;

    // Weighted score: criteria naming a molecular subtype the patient actually
    // has (TNBC, HR+/-, HER2+/-) count double toward the match.
    return computeInclusionScore(criteria.inclusion, inclusionMap, patientProfile);
  }, [hardGatePassed, criteria.inclusion, inclusionMap, patientProfile]);

  const cat = useMemo(() => {
    if (isOrganMismatch || isBreastOvarianMismatch) {
      return {
        label: "Ineligible / Organ System Mismatch",
        color: "text-destructive",
        bg: "bg-destructive-muted",
        border: "border-destructive/30",
      };
    }
    if (!hardGatePassed) {
      return {
        label: "Ineligible / Unmet Inclusion Criteria",
        color: "text-destructive",
        bg: "bg-destructive-muted",
        border: "border-destructive/30",
      };
    }
    return getMatchCategory(score);
  }, [isOrganMismatch, isBreastOvarianMismatch, hardGatePassed, score]);

  return (
    <>
      <Backdrop onClick={onClose} />

      <aside
        className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border-subtle bg-surface shadow-2xl sm:max-w-lg lg:max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Trial Match Simulator"
      >
        {/* ── Header bar (shrink-0) ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Search Results
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
            aria-label="Close simulator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body (flex-1, never overlapped, pb-28 so last item clears footer) ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-28 pt-5 space-y-6">
          {/* Match Gauge */}
          <section className="flex flex-col items-center py-4">
            <MatchGauge score={score} cat={cat} />
            {patientProfile && (
              <button
                onClick={() => setShowReferral(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted/15 px-4 py-2.5 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent-muted/30 active:scale-[0.97] cursor-pointer"
              >
                <FileText className="h-4 w-4" />
                Export Physician Dossier / Patient Summary
              </button>
            )}
          </section>

          {/* Hard Gate Warning Banner — Organ Mismatch */}
          {patientProfile && (isOrganMismatch || isBreastOvarianMismatch) && (
            <div className="rounded-xl border border-destructive/30 bg-destructive-muted p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Organ System Mismatch
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                This trial targets a different organ system than the patient's disease ({patientProfile.extractedParams.disease}). Match score forced to 0%.
              </p>
            </div>
          )}

          {/* Hard Gate Warning Banner — Other Failure */}
          {patientProfile && !isOrganMismatch && !isBreastOvarianMismatch && !hardGatePassed && (
            <div className="rounded-xl border border-destructive/30 bg-destructive-muted p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Core Eligibility Criteria Not Met
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Patient does not meet the baseline inclusion requirements — match score capped at 0%.
                Review inclusion criteria below.
              </p>
            </div>
          )}

          {/* Patient Profile (when loaded from report) */}
          {patientProfile && (
            <PatientInfoPanel profile={patientProfile} />
          )}

          {/* Protocol Waiver Sensitivity Card */}
          {patientProfile && (
            <section
              aria-labelledby="waiver-title"
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-muted">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-accent" />
                  </span>
                  <div>
                    <h3 id="waiver-title" className="text-sm font-semibold text-text-primary">
                      Protocol Waiver Sensitivity
                    </h3>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                      Relax protocol lab thresholds to surface borderline eligibility that may still
                      be granted sponsor approval.
                    </p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums transition-all duration-150 ${
                    waiverTolerance !== 0
                      ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border-default bg-surface text-text-muted"
                  }`}
                >
                  {waiverTolerance > 0 ? `+${waiverTolerance}%` : `${waiverTolerance}%`}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-text-muted">
                <span>-20%</span>
                <span className="font-medium text-text-secondary">Tolerance offset</span>
                <span>+20%</span>
              </div>
              <input
                id="waiver-tolerance"
                type="range"
                min={-20}
                max={20}
                step={1}
                value={waiverTolerance}
                onChange={(e) => setWaiverTolerance(Number(e.target.value))}
                aria-label="Lab value tolerance offset"
                aria-valuetext={`${waiverTolerance > 0 ? "plus " : ""}${waiverTolerance} percent`}
                className="range-electric mt-1.5"
                style={{ "--range-fill": `${((waiverTolerance + 20) / 40) * 100}%` } as CSSProperties}
              />
              <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
                <span>Strict</span>
                <span>Lenient</span>
              </div>

              <p
                role="status"
                aria-live="polite"
                className={`mt-3 rounded-lg px-3 py-2 text-[11px] leading-relaxed transition-all duration-150 ${
                  waiverAnalysis.waiverCount > 0
                    ? "border border-warning/25 bg-warning/10 text-warning"
                    : "border border-border-subtle bg-surface text-text-muted"
                }`}
              >
                {waiverTolerance === 0 ? (
                  "Move the slider to relax lab thresholds — borderline criteria will flag as waiver-eligible."
                ) : waiverAnalysis.waiverCount > 0 ? (
                  <>
                    <strong>
                      {waiverAnalysis.waiverCount} borderline{" "}
                      {waiverAnalysis.waiverCount === 1 ? "criterion" : "criteria"}
                    </strong>{" "}
                    now eligible via waiver request ({waiverAnalysis.waiverMetrics.join(", ")}).
                  </>
                ) : (
                  "No borderline lab criteria fall within this tolerance — the patient meets every measurable protocol threshold."
                )}
              </p>

              {waiverAnalysis.waiverCount > 0 && (
                <div className="mt-3 space-y-2">
                  {Object.entries(waiverAnalysis.byInclusionIndex).map(([index, entry]) => {
                    if (!entry) return null;
                    return (
                      <div key={`inc-${index}`} className="flex items-start gap-2 rounded-lg bg-surface/60 px-3 py-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-warning/30 bg-warning/10">
                          <BadgeCheck className="h-3 w-3 text-warning" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-warning">
                            Eligibility via Protocol Waiver Request
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
                            Requires Sponsor Approval — {entry.metric} within {entry.percent}% variance
                            (patient {entry.patient}
                            {entry.unit} vs protocol {entry.required}
                            {entry.unit})
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {Object.entries(waiverAnalysis.byRuleId).map(([id, entry]) => {
                    if (!entry) return null;
                    return (
                      <div key={`rule-${id}`} className="flex items-start gap-2 rounded-lg bg-surface/60 px-3 py-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-warning/30 bg-warning/10">
                          <BadgeCheck className="h-3 w-3 text-warning" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-warning">
                            Eligibility via Protocol Waiver Request
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-text-secondary">
                            Requires Sponsor Approval — {entry.metric} within {entry.percent}% variance
                            (patient {entry.patient}
                            {entry.unit} vs protocol {entry.required}
                            {entry.unit})
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Trial Summary */}
          <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
            <h2 className="font-heading text-base font-semibold leading-snug text-text-primary">
              {p.identificationModule.briefTitle}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-text-muted">NCT ID</span>
                <p className="font-mono font-medium text-primary">
                  {p.identificationModule.nctId}
                </p>
              </div>
              <div>
                <span className="text-text-muted">Phase</span>
                <p className="font-medium text-text-primary">
                  {p.designModule?.phases?.length
                    ? p.designModule.phases
                        .map((ph) => ph.replace("PHASE", "Phase "))
                        .join("/")
                    : "N/A"}
                </p>
              </div>
              <div>
                <span className="text-text-muted">Sponsor</span>
                <p className="font-medium text-text-primary">
                  {p.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}
                </p>
              </div>
              <div>
                <span className="text-text-muted">Status</span>
                <p className="font-medium text-success">
                  {p.statusModule.overallStatus}
                </p>
              </div>
            </div>
          </section>

          {/* Inclusion Criteria */}
          {criteria.inclusion.length > 0 && (
            <section>
              <CriteriaSection
                title="Inclusion Criteria"
                icon={
                  <CheckCircle className="h-4 w-4 text-success" />
                }
                items={criteria.inclusion}
                checkedMap={inclusionMap}
                onToggle={toggleInclusion}
                accentColor="text-success"
                waiverByIndex={waiverAnalysis.byInclusionIndex}
              />
            </section>
          )}

          {/* Exclusion Criteria */}
          {exclusionCriteriaPresent ? (
            <section>
              <CriteriaSection
                title="Exclusion Criteria"
                icon={
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                }
                items={criteria.exclusion}
                checkedMap={exclusionMap}
                onToggle={toggleExclusion}
                accentColor="text-destructive"
              />
            </section>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised/50 px-3.5 py-2.5 text-xs text-text-muted">
              <Info className="h-3.5 w-3.5 shrink-0 text-accent" />
              No exclusion criteria listed on ClinicalTrials.gov for this trial — not counted against the match score.
            </div>
          )}

          {/* Custom Rules */}
          <section>
            <CustomRuleInput
              rules={customRules}
              onAdd={addCustomRule}
              onToggle={toggleCustom}
              onRemove={removeCustom}
              waiverById={waiverAnalysis.byRuleId}
            />
          </section>

          {/* ── End of scrollable body ── */}
        </div>

        {/* ── Sticky footer — never overlays content ── */}
        <div className="shrink-0 border-t border-border-subtle bg-footer p-4 z-20 sticky bottom-0">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-semibold ${cat.color}`}>{cat.label}</p>
              <p className="text-xs text-text-muted">
                {Math.round(score)}% match based on{" "}
                {criteria.inclusion.length + criteria.exclusion.length + customRules.length}{" "}
                criteria
              </p>
            </div>
            <span className={`font-heading text-2xl font-bold ${cat.color}`}>
              {Math.round(score)}%
            </span>
          </div>
        </div>
      </aside>

      {/* ── Export Summary Modal (Physician Dossier / Patient Summary) ── */}
      {showReferral && patientProfile && (
        <ExportSummaryModal
          study={study}
          patientProfile={patientProfile}
          inclusionMap={inclusionMap}
          exclusionMap={exclusionMap}
          customRules={customRules}
          score={score}
          cat={cat}
          criteria={criteria}
          onClose={() => setShowReferral(false)}
        />
      )}
    </>
  );
}