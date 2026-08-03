import { useState, useMemo } from "react";
import { X, ArrowLeft, CheckCircle, AlertTriangle, Plus, Trash2, Gauge } from "lucide-react";

/* ── Types ─────────────────────────────────────────── */

interface EligibilityModule {
  eligibilityCriteria?: string;
  sex?: string;
  minimumAge?: string;
  maximumAge?: string;
  healthyVolunteers?: boolean;
  stdAges?: string[];
}

interface StudyProtocol {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
    };
    statusModule: {
      overallStatus: string;
    };
    sponsorCollaboratorsModule: {
      leadSponsor: { name: string };
    };
    designModule: {
      phases?: string[];
    };
    eligibilityModule?: EligibilityModule;
  };
}

interface ParsedCriteria {
  inclusion: string[];
  exclusion: string[];
}

interface CustomRule {
  id: string;
  text: string;
  satisfied: boolean;
}

/* ── Match category helpers ────────────────────────── */

function getMatchCategory(score: number): {
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  if (score >= 80) {
    return {
      label: "High Candidate Match",
      color: "text-success",
      bg: "bg-success-muted",
      border: "border-success/30",
    };
  }
  if (score >= 50) {
    return {
      label: "Moderate Candidate Match",
      color: "text-warning",
      bg: "bg-warning-muted",
      border: "border-warning/30",
    };
  }
  return {
    label: "Low Candidate Match",
    color: "text-destructive",
    bg: "bg-destructive-muted",
    border: "border-destructive/30",
  };
}

function getGaugeColor(score: number): string {
  if (score >= 80) return "stroke-success";
  if (score >= 50) return "stroke-warning";
  return "stroke-destructive";
}

/* ── Eligibility text parser ────────────────────────── */

function parseEligibilityCriteria(text?: string): ParsedCriteria {
  if (!text || text.trim().length === 0) {
    return { inclusion: [], exclusion: [] };
  }

  const lower = text;
  const hasInclusion = /inclusion\s*criteria/i.test(lower);
  const hasExclusion = /exclusion\s*criteria/i.test(lower);

  let inclusionPart = "";
  let exclusionPart = "";

  if (hasInclusion && hasExclusion) {
    // Split on the exclusion header
    const split = lower.split(/exclusion\s*criteria\s*:?\s*/i);
    inclusionPart = split[0].replace(/inclusion\s*criteria\s*:?\s*/i, "").trim();
    exclusionPart = (split[1] || "").trim();
  } else if (hasInclusion) {
    inclusionPart = lower.replace(/inclusion\s*criteria\s*:?\s*/i, "").trim();
  } else if (hasExclusion) {
    exclusionPart = lower.replace(/exclusion\s*criteria\s*:?\s*/i, "").trim();
  } else {
    // No headers — treat everything as inclusion
    inclusionPart = lower.trim();
  }

  const extractItems = (text: string): string[] =>
    text
      .split("\n")
      .map((line) =>
        line
          .replace(/^[\s•\-‣▪▸→*]+/, "")
          .replace(/^\d+[\.\)]\s*/, "")
          .trim()
      )
      .filter((line) => {
        if (line.length <= 3) return false;
        if (/^\s*$/.test(line)) return false;
        // Skip header fragments — text that is just a heading label
        if (/^(inclusion|exclusion)\s*criteria\s*:?\s*$/i.test(line)) return false;
        if (/^include\s*:?\s*$/i.test(line)) return false;
        if (/^exclude\s*:?\s*$/i.test(line)) return false;
        // Skip any line that is just a colon-terminated label
        if (/^[^a-z0-9]*[a-z\s]+\s*:\s*$/i.test(line) && line.length < 40) return false;
        return true;
      });

  return {
    inclusion: extractItems(inclusionPart),
    exclusion: extractItems(exclusionPart),
  };
}

/* ── Circular Gauge ──────────────────────────────────── */

function MatchGauge({ score }: { score: number }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const cat = getMatchCategory(score);
  const color = getGaugeColor(score);

  return (
    <div className="flex flex-col items-center">
      <div className="animate-gauge-appear relative flex h-32 w-32 items-center justify-center">
        {/* Background track */}
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
        {/* Percentage text */}
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

/* ── Criteria Section ────────────────────────────────── */

function CriteriaSection({
  title,
  icon,
  items,
  checkedMap,
  onToggle,
  accentColor,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  checkedMap: Record<number, boolean>;
  onToggle: (index: number) => void;
  accentColor: string;
}) {
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
        {items.map((item, i) => (
          <li key={i}>
            <label
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
              <span className="text-sm leading-snug text-text-primary">{item}</span>
            </label>
          </li>
        ))}
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
}: {
  rules: CustomRule[];
  onAdd: (text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
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

      {/* Input row */}
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

      {/* Custom rules list */}
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
                <button
                  onClick={() => onRemove(rule.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-0 transition-all duration-150 hover:bg-destructive-muted hover:text-destructive group-hover:opacity-100 cursor-pointer"
                  title="Remove rule"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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

interface SimulatorProps {
  study: StudyProtocol;
  onClose: () => void;
}

export default function TrialMatchSimulator({ study, onClose }: SimulatorProps) {
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

  /* ── Toggles ── */
  const toggleInclusion = (index: number) =>
    setInclusionMap((prev) => ({ ...prev, [index]: !prev[index] }));

  const toggleExclusion = (index: number) =>
    setExclusionMap((prev) => ({ ...prev, [index]: !prev[index] }));

  const addCustomRule = (text: string) =>
    setCustomRules((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, satisfied: true },
    ]);

  const toggleCustom = (id: string) =>
    setCustomRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, satisfied: !r.satisfied } : r))
    );

  const removeCustom = (id: string) =>
    setCustomRules((prev) => prev.filter((r) => r.id !== id));

  /* ── Calculate score ── */
  const score = useMemo(() => {
    const totalInclusion = criteria.inclusion.length;
    const totalExclusion = criteria.exclusion.length;
    const totalCustom = customRules.length;
    const total = totalInclusion + totalExclusion + totalCustom;
    if (total === 0) return 0;

    const checkedInclusion = criteria.inclusion.filter((_, i) => inclusionMap[i]).length;
    const uncheckedExclusion = criteria.exclusion.filter((_, i) => !exclusionMap[i]).length;
    const satisfiedCustom = customRules.filter((r) => r.satisfied).length;

    return Math.round(
      ((checkedInclusion + uncheckedExclusion + satisfiedCustom) / total) * 100
    );
  }, [criteria, inclusionMap, exclusionMap, customRules]);

  const cat = getMatchCategory(score);

  /* ── Close on Escape ── */
  /* (handled via backdrop click + close button) */

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

        {/* ── Scrollable body (flex-1, never overlapped) ── */}
        <div className="flex-1 overflow-y-auto px-5 pb-24 pt-5 space-y-6">
          {/* Match Gauge */}
          <section className="flex flex-col items-center py-4">
            <MatchGauge score={score} />
          </section>

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
              />
            </section>
          )}

          {/* Exclusion Criteria */}
          {criteria.exclusion.length > 0 && (
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
          )}

          {/* Custom Rules */}
          <section>
            <CustomRuleInput
              rules={customRules}
              onAdd={addCustomRule}
              onToggle={toggleCustom}
              onRemove={removeCustom}
            />
          </section>

          {/* ── End of scrollable body ── */}
        </div>

        {/* ── Summary bar (shrink-0, never overlaps content) ── */}
        <div
          className={`shrink-0 border-t px-5 py-4 ${cat.border} ${cat.bg}`}
        >
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
    </>
  );
}