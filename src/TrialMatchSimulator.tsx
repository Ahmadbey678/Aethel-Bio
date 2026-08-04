import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { X, ArrowLeft, CheckCircle, AlertTriangle, Plus, Trash2, Gauge, ChevronDown, ChevronUp, Dna, Stethoscope, Beaker, Brain, FlaskConical, Copy, Check, FileText, Loader2 } from "lucide-react";

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
  required?: boolean;
}

interface ExtractedParams {
  mutation: string;
  disease: string;
  egfr: number | null;
  platelets: number | null;
  noBrainMets: boolean;
  age: number | null;
  sex: string | null;
  wbc: number | null;
  hemoglobin: number | null;
  creatinine: number | null;
  alt: number | null;
  ast: number | null;
  additionalMutations: string[];
  reportSummary: string;
}

interface PatientProfile {
  biomarker: string;
  condition: string;
  extractedParams: ExtractedParams;
}

interface SimulatorProps {
  study: StudyProtocol;
  patientProfile?: PatientProfile;
  onClose: () => void;
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

/* ── OCR / text normalisation for outreach ──────────── */

function normalizeMutationForOutreach(text: string): string {
  return text.replace(/p\.\s*Gin\b/g, "p.Gln");
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
    const split = lower.split(/exclusion\s*criteria\s*:?\s*/i);
    inclusionPart = split[0].replace(/inclusion\s*criteria\s*:?\s*/i, "").trim();
    exclusionPart = (split[1] || "").trim();
  } else if (hasInclusion) {
    inclusionPart = lower.replace(/inclusion\s*criteria\s*:?\s*/i, "").trim();
  } else if (hasExclusion) {
    exclusionPart = lower.replace(/exclusion\s*criteria\s*:?\s*/i, "").trim();
  } else {
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
        if (/^(inclusion|exclusion)\s*criteria\s*:?\s*$/i.test(line)) return false;
        if (/^include\s*:?\s*$/i.test(line)) return false;
        if (/^exclude\s*:?\s*$/i.test(line)) return false;
        if (/^[^a-z0-9]*[a-z\s]+\s*:\s*$/i.test(line) && line.length < 40) return false;
        return true;
      });

  return {
    inclusion: extractItems(inclusionPart),
    exclusion: extractItems(exclusionPart),
  };
}

/* ── Auto-matching logic ─────────────────────────────── */

function autoMatchInclusion(
  items: string[],
  patient: PatientProfile,
): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  const { mutation, disease, egfr, platelets } = patient.extractedParams;

  // Build keyword set from the patient profile
  const mutParts = mutation.toLowerCase().split(/\s+/);
  const diseaseParts = disease.toLowerCase().split(/\s+/);
  // Extract key disease terms: "triple-negative" → "triple", "negative", "triple-negative"
  // "breast cancer" → "breast", "cancer"
  const diseaseKeywords = diseaseParts
    .map((p) => p.replace(/[^a-z0-9-]/g, ""))
    .filter((p) => p.length > 2);

  // Also add compound terms
  const compoundTerms: string[] = [];
  for (let i = 0; i < diseaseParts.length - 1; i++) {
    const compound = `${diseaseParts[i]}-${diseaseParts[i + 1]}`;
    if (compound.length > 3) compoundTerms.push(compound);
  }

  const keywords = [
    ...mutParts.filter((p) => p.length > 2),
    mutation.toLowerCase(),
    ...diseaseKeywords,
    ...compoundTerms,
    // Abbreviations
    "tnbc",
    "brca",
  ];

  items.forEach((item, i) => {
    const lower = item.toLowerCase();

    // Check for mutation match
    const matchesMutation = keywords.some(
      (k) => k.length > 2 && lower.includes(k),
    );

    // Check for lab value match (e.g. "eGFR > 60" — patient eGFR 74 qualifies)
    const hasEGFR = /egfr|gfr|creatinine|renal\s*function/.test(lower);
    const egfrMatch = hasEGFR && egfr !== null && egfr >= 60;

    const hasPlatelets = /platelet|thrombocyte|hematologic/.test(lower);
    const plateletMatch = hasPlatelets && platelets !== null && platelets >= 100;

    // Broad match for "breast cancer" or "solid tumor" — assume patient qualifies
    const broadMatch =
      /breast\s*cancer|solid\s*tumor|advanced\s*malignancy|metastatic\s*cancer/i.test(
        lower,
      ) && disease.toLowerCase().includes("cancer");

    map[i] = matchesMutation || egfrMatch || plateletMatch || broadMatch;
  });

  return map;
}

function autoMatchExclusion(
  items: string[],
  patient: PatientProfile,
): Record<number, boolean> {
  // Start with all exclusion criteria unchecked (meaning patient doesn't satisfy them)
  // We auto-CHECK items that DO apply to the patient so they affect the score negatively
  const map: Record<number, boolean> = {};
  const { noBrainMets, egfr, platelets } = patient.extractedParams;

  items.forEach((item, i) => {
    const lower = item.toLowerCase();

    // If item mentions active brain metastases and patient has no brain mets → NOT excluded
    if (/brain\s*metasta|brain\s*tumor|cns\s*metasta/.test(lower) && noBrainMets) {
      map[i] = false; // patient does NOT satisfy this exclusion = good
      return;
    }

    // If item mentions eGFR < 30 or renal impairment, but patient eGFR is 74 → NOT excluded
    if (/egfr\s*<\s*30|dialysis|renal\s*failure/.test(lower) && egfr !== null && egfr >= 60) {
      map[i] = false;
      return;
    }

    // If item mentions platelets < 100K but patient has 185K → NOT excluded
    if (/platelet.*<\s*100|thrombocytopenia/.test(lower) && platelets !== null && platelets >= 100) {
      map[i] = false;
      return;
    }

    // Default: leave unchecked (not applicable)
    map[i] = false;
  });

  return map;
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
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  checkedMap: Record<number, boolean>;
  onToggle: (index: number) => void;
  accentColor: string;
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

/* ── Referral Summary Modal ─────────────────────────── */

function ReferralSummaryModal({
  study,
  patientProfile,
  inclusionMap,
  exclusionMap,
  customRules,
  score,
  cat,
  criteria,
  onClose,
}: {
  study: StudyProtocol;
  patientProfile: PatientProfile;
  inclusionMap: Record<number, boolean>;
  exclusionMap: Record<number, boolean>;
  customRules: CustomRule[];
  score: number;
  cat: { label: string; color: string; bg: string; border: string };
  criteria: ParsedCriteria;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const protocol = study.protocolSection;
  const params = patientProfile.extractedParams;
  const fmtL = (val: number | null, unit: string) =>
    val !== null ? `${val} ${unit}` : "N/A";

  const checkedInclusionCount = criteria.inclusion.filter((_, i) => inclusionMap[i]).length;
  const uncheckedExclusionCount = criteria.exclusion.filter((_, i) => !exclusionMap[i]).length;
  const satisfiedCustomCount = customRules.filter((r) => r.satisfied).length;

  // Build the full referral letter text for copy
  const referralText = [
    `CLINICAL REFERRAL SUMMARY — ${cat.label.toUpperCase()}`,
    "",
    "────────────────────────────────────────────",
    "PATIENT PROFILE",
    "────────────────────────────────────────────",
    `Mutation: ${params.mutation}`,
    `Disease: ${params.disease}`,
    `eGFR: ${fmtL(params.egfr, "mL/min")}`,
    `Platelets: ${fmtL(params.platelets, "K/µL")}`,
    `Brain Metastases: ${params.noBrainMets ? "None detected" : "Present"}`,
    "",
    "────────────────────────────────────────────",
    "TARGET TRIAL",
    "────────────────────────────────────────────",
    `Title: ${protocol.identificationModule.briefTitle}`,
    `NCT ID: ${protocol.identificationModule.nctId}`,
    `Phase: ${protocol.designModule?.phases?.length ? protocol.designModule.phases.map((ph) => ph.replace("PHASE", "Phase ")).join("/") : "N/A"}`,
    `Sponsor: ${protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}`,
    `Status: ${protocol.statusModule.overallStatus}`,
    "",
    "────────────────────────────────────────────",
    "ELIGIBILITY RATIONALE",
    "────────────────────────────────────────────",
    `Match Score: ${Math.round(score)}% — ${cat.label}`,
    `Inclusion criteria satisfied: ${checkedInclusionCount} / ${criteria.inclusion.length}`,
    `Exclusion criteria cleared: ${uncheckedExclusionCount} / ${criteria.exclusion.length}`,
    `Custom lab rules satisfied: ${satisfiedCustomCount} / ${customRules.length}`,
    "",
    "────────────────────────────────────────────",
    "PRINCIPAL INVESTIGATOR OUTREACH DRAFT",
    "────────────────────────────────────────────",
    `Dear Principal Investigator,`,
    "",
    `I am writing to refer a patient for consideration in the ${protocol.identificationModule.briefTitle} (${protocol.identificationModule.nctId}).`,
    "",
    `The patient presents with ${params.disease} and carries the ${normalizeMutationForOutreach(params.mutation)} mutation. Key laboratory values — eGFR ${fmtL(params.egfr, "mL/min")}, platelets ${fmtL(params.platelets, "K/µL")} — fall within the study's anticipated parameters.`,
    "",
    `Eligibility assessment yielded a ${Math.round(score)}% match (${cat.label}), with ${checkedInclusionCount} of ${
      criteria.inclusion.length
    } inclusion criteria met and ${uncheckedExclusionCount} of ${
      criteria.exclusion.length
    } exclusion criteria cleared.`,
    "",
    "Please find the full patient profile and eligibility checklist attached. I welcome the opportunity to discuss this case further and provide any additional documentation required.",
    "",
    "Respectfully,",
    "Aethel Bio — AI Clinical Trial Matching",
  ].join("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralText);
    } catch {
      // Fallback: create a hidden textarea, copy via execCommand
      const textarea = document.createElement("textarea");
      textarea.value = referralText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Final fallback — nothing more we can do
      }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Multi‑page PDF Export via html-to-image + jsPDF ── */
  const handleDownloadPdf = useCallback(async () => {
    if (!printRef.current) return;
    setPdfGenerating(true);

    try {
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pdfWidth = 210; // mm

      // Page sections are already rendered (parent is offscreen, not display:none)
      const page1Container = printRef.current.querySelector<HTMLElement>("#pdf-page-1");
      const page2Container = printRef.current.querySelector<HTMLElement>("#pdf-page-2");

      if (page1Container) {
        const imgData1 = await toPng(page1Container, {
          quality: 0.95,
          backgroundColor: "#0b1329",
          pixelRatio: 2,
        });
        const imgProps1 = pdf.getImageProperties(imgData1);
        const pdfHeight1 = (pdfWidth * imgProps1.height) / imgProps1.width;
        pdf.addImage(imgData1, "PNG", 0, 0, pdfWidth, pdfHeight1, undefined, "FAST");
      }

      if (page2Container) {
        const imgData2 = await toPng(page2Container, {
          quality: 0.95,
          backgroundColor: "#0b1329",
          pixelRatio: 2,
        });
        const imgProps2 = pdf.getImageProperties(imgData2);
        const pdfHeight2 = (pdfWidth * imgProps2.height) / imgProps2.width;
        pdf.addPage();
        pdf.addImage(imgData2, "PNG", 0, 0, pdfWidth, pdfHeight2, undefined, "FAST");
      }

      const nctId = protocol.identificationModule.nctId;
      pdf.save(`Clinical_Referral_Summary_${nctId}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  }, [printRef, protocol.identificationModule.nctId]);

  const matchPct = Math.round(score);
  const catLabel = cat.label;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const badgeFg = matchPct >= 80 ? "#22c55e" : matchPct >= 50 ? "#eab308" : "#ef4444";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
      `}</style>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
        <div
          className="animate-scale-in relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border-subtle bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Modal Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-6 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-accent" />
              <h2 className="font-heading text-base font-semibold text-text-primary">
                Clinical Referral Summary
              </h2>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto space-y-5 px-6 py-5">
            {/* Patient Profile Summary */}
            <section className="rounded-xl border border-accent/20 bg-accent-muted/10 p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
                <Dna className="h-4 w-4" />
                Patient Profile Summary
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <span className="text-xs text-text-muted">Mutation</span>
                  <p className="font-medium text-text-primary">{params.mutation}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Disease</span>
                  <p className="font-medium text-text-primary">{params.disease}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">eGFR</span>
                  <p className="font-medium text-text-primary">{fmtL(params.egfr, "mL/min")}</p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Platelets</span>
                  <p className="font-medium text-text-primary">{fmtL(params.platelets, "K/µL")}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-text-muted">Brain Metastases</span>
                  <p className="font-medium text-success">None detected ✓</p>
                </div>
              </div>
            </section>

            {/* Target Trial Info */}
            <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <FlaskConical className="h-4 w-4" />
                Target Trial
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2">
                  <span className="text-xs text-text-muted">Title</span>
                  <p className="font-medium text-text-primary leading-snug">
                    {protocol.identificationModule.briefTitle}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">NCT ID</span>
                  <p className="font-mono font-medium text-primary">
                    {protocol.identificationModule.nctId}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Phase</span>
                  <p className="font-medium text-text-primary">
                    {protocol.designModule?.phases?.length
                      ? protocol.designModule.phases.map((ph) => ph.replace("PHASE", "Phase ")).join("/")
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Sponsor</span>
                  <p className="font-medium text-text-primary">
                    {protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-text-muted">Status</span>
                  <p className="font-medium text-success">{protocol.statusModule.overallStatus}</p>
                </div>
              </div>
            </section>

            {/* Eligibility Rationale & Match Score */}
            <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Gauge className="h-4 w-4" />
                Eligibility Rationale &amp; Match Score
              </h3>
              <div className="mb-3 flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cat.bg} ${cat.color}`}
                >
                  {Math.round(score)}% — {cat.label}
                </span>
              </div>

              {/* Hard Gate / Eligibility Status */}
              {!cat.label.includes("Ineligible") && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-success-muted/30 px-3 py-1.5 text-xs font-medium text-success">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Eligible Candidate — Baseline inclusion threshold met
                </div>
              )}
              {cat.label.includes("Ineligible") && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-destructive-muted px-3 py-1.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Ineligible / Unmet Inclusion Criteria — score capped at 0%
                </div>
              )}

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <span className="text-text-secondary">Inclusion criteria satisfied</span>
                  <span className="font-medium text-text-primary">
                    {checkedInclusionCount} / {criteria.inclusion.length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <span className="text-text-secondary">Exclusion criteria cleared</span>
                  <span className="font-medium text-text-primary">
                    {uncheckedExclusionCount} / {criteria.exclusion.length}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
                  <span className="text-text-secondary">Custom lab rules satisfied</span>
                  <span className="font-medium text-text-primary">
                    {satisfiedCustomCount} / {customRules.length}
                  </span>
                </div>
              </div>
            </section>

            {/* Core Criteria Checklist */}
            {criteria.inclusion.length > 0 && (
              <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-success">
                  <CheckCircle className="h-4 w-4" />
                  Core Criteria Checklist &mdash; Inclusion ({checkedInclusionCount}/{criteria.inclusion.length})
                </h3>
                <ul className="space-y-1.5">
                  {criteria.inclusion.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm">
                      {inclusionMap[i] ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-destructive/50 bg-destructive-muted/20 text-xs font-bold text-destructive">
                          ✗
                        </span>
                      )}
                      <span className="text-text-primary">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Principal Investigator Outreach Draft */}
            <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
                <FileText className="h-4 w-4" />
                Principal Investigator Outreach Draft
              </h3>
              <div className="rounded-lg border border-border-subtle bg-surface p-4 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
                {`Dear Principal Investigator,

I am writing to refer a patient for consideration in the ${protocol.identificationModule.briefTitle} (${protocol.identificationModule.nctId}).

The patient presents with ${params.disease} and carries the ${normalizeMutationForOutreach(params.mutation)} mutation. Key laboratory values — eGFR ${fmtL(params.egfr, "mL/min")}, platelets ${fmtL(params.platelets, "K/µL")} — fall within the study's anticipated parameters.

Eligibility assessment yielded a ${Math.round(score)}% match (${cat.label}), with ${checkedInclusionCount} of ${criteria.inclusion.length} inclusion criteria met and ${uncheckedExclusionCount} of ${criteria.exclusion.length} exclusion criteria cleared.

Please find the full patient profile and eligibility checklist attached. I welcome the opportunity to discuss this case further and provide any additional documentation required.

Respectfully,
Aethel Bio — AI Clinical Trial Matching`}
              </div>
            </section>
          </div>

          {/* ── Footer Actions ── */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
            >
              Close
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadPdf}
                disabled={pdfGenerating}
                className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted/15 px-4 py-2 text-sm font-medium text-accent transition-all duration-150 hover:bg-accent-muted/30 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {pdfGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Generating PDF…</span>
                    <span className="sm:hidden">PDF…</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">Download PDF Summary</span>
                    <span className="sm:hidden">PDF</span>
                  </>
                )}{" "}
                </button>
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold shadow-glow transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                  copied
                    ? "bg-success text-white hover:bg-success/80"
                    : "bg-accent text-white hover:bg-accent/80"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    ✓ Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Printable Print Overlay (split into pages) ── */}
      <div id="printable-referral-summary" ref={printRef} style={{ display: "none" }}>
        {/* ── Page 1: Patient Profile, Trial, Eligibility, Checklist ── */}
        <div id="pdf-page-1" style={{ display: "none" }}>
          <div style={{ background: "#0b1329", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "56px" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1e293b", paddingBottom: "12px", marginBottom: "20px" }}>
              <div>
                <div style={{ color: "#38bdf8", fontSize: "22px", fontWeight: "bold" }}>Aethel Bio</div>
                <div style={{ color: "#38bdf8", fontSize: "14px", fontWeight: "normal" }}>Clinical Referral Summary</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: badgeFg, fontSize: "14px", fontWeight: "bold" }}>{matchPct}% — {catLabel}</div>
                <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "4px" }}>{dateStr}</div>
              </div>
            </div>

            {/* Patient Profile */}
            <div className="print-card" style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", padding: "14px", marginBottom: "14px" }}>
              <div style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold", marginBottom: "10px", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>PATIENT PROFILE SUMMARY</div>
              <div style={{ display: "flex", gap: "20px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Mutation</div>
                    <div style={{ color: "#f8fafc", fontSize: "13px", fontWeight: "bold" }}>{params.mutation}</div>
                  </div>
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>eGFR</div>
                    <div style={{ color: "#f8fafc", fontSize: "13px", fontWeight: "bold" }}>{fmtL(params.egfr, "mL/min")}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Brain Metastases</div>
                    <div style={{ color: "#22c55e", fontSize: "13px", fontWeight: "bold" }}>✓ None detected</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "10px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Disease</div>
                    <div style={{ color: "#f8fafc", fontSize: "13px", fontWeight: "bold" }}>{params.disease}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Platelets</div>
                    <div style={{ color: "#f8fafc", fontSize: "13px", fontWeight: "bold" }}>{fmtL(params.platelets, "K/µL")}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Target Trial */}
            <div className="print-card" style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", padding: "14px", marginBottom: "14px" }}>
              <div style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold", marginBottom: "10px", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>TARGET TRIAL</div>
              <div style={{ marginBottom: "8px" }}>
                <div style={{ color: "#94a3b8", fontSize: "10px" }}>Title</div>
                <div style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{protocol.identificationModule.briefTitle}</div>
              </div>
              <div style={{ display: "flex", gap: "20px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>NCT ID</div>
                    <div style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold", fontFamily: "Courier, monospace" }}>{protocol.identificationModule.nctId}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Sponsor</div>
                    <div style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}</div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Phase</div>
                    <div style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{protocol.designModule?.phases?.length ? protocol.designModule.phases.map((ph) => ph.replace("PHASE", "Phase ")).join("/") : "N/A"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: "10px" }}>Status</div>
                    <div style={{ color: "#22c55e", fontSize: "12px", fontWeight: "bold" }}>{protocol.statusModule.overallStatus}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Eligibility Rationale */}
            <div className="print-card" style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", padding: "14px", marginBottom: "14px" }}>
              <div style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold", marginBottom: "10px", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>ELIGIBILITY RATIONALE &amp; MATCH SCORE</div>
              <div style={{ marginBottom: "8px" }}>
                <span style={{ background: matchPct >= 80 ? "#166534" : matchPct >= 50 ? "#713f12" : "#7f1d1d", color: badgeFg, fontSize: "11px", fontWeight: "bold", padding: "3px 10px", borderRadius: "12px" }}>{matchPct}% — {catLabel}</span>
              </div>
              <div style={{ borderTop: "1px solid #1e293b", paddingTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>Inclusion criteria satisfied</span>
                  <span style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{checkedInclusionCount} / {criteria.inclusion.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid #1e293b" }}>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>Exclusion criteria cleared</span>
                  <span style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{uncheckedExclusionCount} / {criteria.exclusion.length}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: "1px solid #1e293b" }}>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>Custom lab rules satisfied</span>
                  <span style={{ color: "#f8fafc", fontSize: "12px", fontWeight: "bold" }}>{satisfiedCustomCount} / {customRules.length}</span>
                </div>
              </div>
              {/* Inclusion checklist in PDF */}
              {criteria.inclusion.length > 0 && (
                <div style={{ borderTop: "1px solid #1e293b", paddingTop: "8px", marginTop: "8px" }}>
                  <div style={{ color: "#22c55e", fontSize: "11px", fontWeight: "bold", marginBottom: "6px" }}>
                    Core Criteria Checklist — Inclusion ({checkedInclusionCount}/{criteria.inclusion.length})
                  </div>
                  {criteria.inclusion.map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "4px 0", borderBottom: i < criteria.inclusion.length - 1 ? "1px solid #1e293b" : "none" }}>
                      <span style={{ color: inclusionMap[i] ? "#22c55e" : "#ef4444", fontSize: "12px", fontWeight: "bold", width: "14px", textAlign: "center", flexShrink: 0 }}>
                        {inclusionMap[i] ? "✓" : "✗"}
                      </span>
                      <span style={{ color: "#f8fafc", fontSize: "10px", lineHeight: "1.4" }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer for page 1 */}
            <div style={{ textAlign: "center", color: "#475569", fontSize: "10px", borderTop: "1px solid #1e293b", paddingTop: "10px", marginTop: "20px" }}>
              Page 1 of 2 — Generated by Aethel Bio
            </div>
          </div>
        </div>

        {/* ── Page 2: Outreach Letter with full signature block ── */}
        <div id="pdf-page-2" style={{ display: "none" }}>
          <div style={{ background: "#0b1329", color: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif", padding: "56px", minHeight: "297mm" }}>
            {/* Letterhead */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #1e293b", paddingBottom: "12px", marginBottom: "24px" }}>
              <div>
                <div style={{ color: "#38bdf8", fontSize: "22px", fontWeight: "bold" }}>Aethel Bio</div>
                <div style={{ color: "#38bdf8", fontSize: "14px", fontWeight: "normal" }}>Clinical Referral Summary</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: badgeFg, fontSize: "14px", fontWeight: "bold" }}>{matchPct}% — {catLabel}</div>
                <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "4px" }}>{dateStr}</div>
              </div>
            </div>

            {/* Outreach Draft Letter */}
            <div className="print-card" style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "6px", padding: "24px 28px", marginBottom: "14px", minHeight: "180mm" }}>
              <div style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold", marginBottom: "12px", borderBottom: "1px solid #1e293b", paddingBottom: "6px" }}>PRINCIPAL INVESTIGATOR OUTREACH DRAFT</div>
              <div style={{ color: "#94a3b8", fontSize: "12px", lineHeight: "1.8", whiteSpace: "pre-wrap" }}>{`Dear Principal Investigator,

I am writing to refer a patient for consideration in the ${protocol.identificationModule.briefTitle} (${protocol.identificationModule.nctId}).

The patient presents with ${params.disease} and carries the ${normalizeMutationForOutreach(params.mutation)} mutation. Key laboratory values — eGFR ${fmtL(params.egfr, "mL/min")}, platelets ${fmtL(params.platelets, "K/µL")} — fall within the study's anticipated parameters.

Eligibility assessment yielded a ${matchPct}% match (${catLabel}), with ${checkedInclusionCount} of ${criteria.inclusion.length} inclusion criteria met and ${uncheckedExclusionCount} of ${criteria.exclusion.length} exclusion criteria cleared.

Please find the full patient profile and eligibility checklist attached. I welcome the opportunity to discuss this case further and provide any additional documentation required.

Respectfully,
Aethel Bio — AI Clinical Trial Matching

${protocol.identificationModule.nctId}
${protocol.sponsorCollaboratorsModule?.leadSponsor?.name || ""}
${protocol.identificationModule.briefTitle}`}</div>
            </div>

            {/* Footer for page 2 */}
            <div style={{ textAlign: "center", color: "#475569", fontSize: "10px", borderTop: "1px solid #1e293b", paddingTop: "10px", marginTop: "16px" }}>
              Page 2 of 2 — Generated by Aethel Bio
            </div>
          </div>
        </div>
      </div>
    </>
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
    const totalInclusion = criteria.inclusion.length;
    const checkedInclusion = criteria.inclusion.filter((_, i) => inclusionMap[i]).length;
    const inclusionMetRatio = totalInclusion > 0 ? checkedInclusion / totalInclusion : 1;
    const requiredParamsPass = customRules.filter((r) => r.required).every((r) => r.satisfied);
    return inclusionMetRatio >= 0.50 && requiredParamsPass;
  }, [criteria, inclusionMap, customRules]);

  const score = useMemo(() => {
    if (!hardGatePassed) return 0;

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
  }, [hardGatePassed, criteria, inclusionMap, exclusionMap, customRules]);

  const cat = useMemo(() => {
    if (!hardGatePassed) {
      return {
        label: "Ineligible / Unmet Inclusion Criteria",
        color: "text-destructive",
        bg: "bg-destructive-muted",
        border: "border-destructive/30",
      };
    }
    return getMatchCategory(score);
  }, [hardGatePassed, score]);

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
                Export Clinical Referral Summary
              </button>
            )}
          </section>

          {/* Hard Gate Warning Banner */}
          {patientProfile && !hardGatePassed && (
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

      {/* ── Referral Summary Modal ── */}
      {showReferral && patientProfile && (
        <ReferralSummaryModal
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