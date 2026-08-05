import { useState, useMemo, useEffect, useCallback } from "react";
import { jsPDF } from "jspdf";
import { X, ArrowLeft, CheckCircle, AlertTriangle, Plus, Trash2, Gauge, ChevronDown, ChevronUp, Dna, Stethoscope, Beaker, Brain, FlaskConical, Copy, Check, FileText, Loader2, MapPin, Info } from "lucide-react";
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

/* ── OCR / text normalisation for outreach ──────────── */

function normalizeMutationForOutreach(text: string): string {
  return text
    .replace(/p\.\s*Gin\b/g, "p.Gln")                    // "p. Gin" → "p.Gln"
    .replace(/(Profs)\s+(\d+)/g, "$1*$2");               // "Profs 74" → "Profs*74"
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
    criteria.exclusion.length > 0
      ? `Exclusion criteria cleared: ${uncheckedExclusionCount} / ${criteria.exclusion.length}`
      : `Exclusion criteria: none listed on ClinicalTrials.gov — not penalized`,
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

  /* ── Pure jsPDF Export (no DOM rasterization) ── */
  const handleDownloadPdf = useCallback(async () => {
    setPdfGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const M = 15; // margin
      const CW = 180; // content width

      // ── Dark theme constants ──
      const BG_RGB: [number, number, number] = [11, 15, 25];       // #0B0F19
      const TEXT_WHITE: [number, number, number] = [248, 250, 252]; // #F8FAFC
      const TEXT_MUTED: [number, number, number] = [148, 163, 184]; // #94A3B8
      const TEXT_ACCENT: [number, number, number] = [56, 189, 248]; // #38BDF8
      const GREEN: [number, number, number] = [34, 197, 94];        // #22C55E
      const RED: [number, number, number] = [239, 68, 68];          // #EF4444
      const DIVIDER_CLR: [number, number, number] = [30, 41, 59];   // #1E293B
      const FOOTER_CLR: [number, number, number] = [71, 85, 105];   // #475569

      // ── Fill a whole page with dark background ──
      const fillBg = () => {
        pdf.setFillColor(BG_RGB[0], BG_RGB[1], BG_RGB[2]);
        pdf.rect(0, 0, 210, 297, "F");
      };

      // ── Font defaults ──
      pdf.setFont("helvetica", "normal");
      pdf.setCharSpace(0);
      pdf.setLineHeightFactor(1.35);

      fillBg();

      const dateStrFull = new Date().toLocaleDateString("en-US", {
        month: "long", day: "numeric", year: "numeric",
      });

      const matchPct = Math.round(score);
      const catLabel = cat.label;
      const badgeRGB: [number, number, number] = matchPct >= 80 ? GREEN : matchPct >= 50 ? [234, 179, 8] : RED;

      const fmtVal = (val: number | null, unit: string) =>
        val !== null ? `${val} ${unit}` : "N/A";

      const trialTitle = protocol.identificationModule.briefTitle;
      const trialNct = protocol.identificationModule.nctId;
      const trialSponsor = protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown";
      const trialPhase = protocol.designModule?.phases?.length
        ? protocol.designModule.phases.map((ph) => ph.replace("PHASE", "Phase ")).join("/")
        : "N/A";

      // Normalized mutation for outreach (p.Gin1756Profs → p.Gln1756Profs*74)
      const mutations = normalizeMutationForOutreach(params.mutation);
      const checkedInc = criteria.inclusion.filter((_, i) => inclusionMap[i]).length;
      const uncheckedExc = criteria.exclusion.filter((_, i) => !exclusionMap[i]).length;
      const satisfiedCust = customRules.filter((r) => r.satisfied).length;

      /* ── Helper: section divider ── */
      const divider = (yPos: number) => {
        pdf.setDrawColor(DIVIDER_CLR[0], DIVIDER_CLR[1], DIVIDER_CLR[2]);
        pdf.line(M, yPos, 210 - M, yPos);
      };

      /* ── Helper: section header line ── */
      const sectionHead = (text: string, yPos: number) => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
        pdf.text(text.toUpperCase(), M, yPos);
        divider(yPos + 2);
        return yPos + 9;
      };

      /* ── Helper: labelled value ── */
      const labelVal = (label: string, value: string, x: number, yPos: number, valColor?: [number, number, number]) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text(label, x, yPos);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(...(valColor || TEXT_WHITE));
        pdf.text(value, x, yPos + 4);
        return yPos + 11;
      };

      // ════════════════ PAGE 1 ════════════════
      let y = M + 5;

      // ── Header ──
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
      pdf.text("Aethel Bio — Clinical Referral Summary", M, y);
      y += 6;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      pdf.text(dateStrFull, M, y);

      // Badge
      const badgeText = `${matchPct}% — ${catLabel}`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(badgeRGB[0], badgeRGB[1], badgeRGB[2]);
      const badgeW = pdf.getTextWidth(badgeText) + 8;
      const badgeX = 210 - M - badgeW;
      pdf.setDrawColor(badgeRGB[0], badgeRGB[1], badgeRGB[2]);
      pdf.setFillColor(badgeRGB[0], badgeRGB[1], badgeRGB[2], 0.15);
      pdf.roundedRect(badgeX, M, badgeW, 7, 2, 2, "FD");
      pdf.text(badgeText, badgeX + 4, M + 5);

      y = M + 14;
      divider(y);
      y += 8;

      // ── PATIENT PROFILE SUMMARY ──
      y = sectionHead("Patient Profile Summary", y);
      let cy = y;
      // Left column: Biomarker, eGFR, Brain Mets
      cy = labelVal("Biomarker", mutations, M, cy);
      cy = labelVal("eGFR", fmtVal(params.egfr, "mL/min"), M, cy);
      // Brain Metastases — render cleanly; avoid special chars that break jsPDF
      {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text("Brain Metastases", M, cy);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
        const bmText = params.noBrainMets ? "None detected" : "Present";
        pdf.text(bmText, M, cy + 4);
        cy += 11;
      }
      // Right column: Disease (wrapped), Platelets
      {
        cy = y;
        // Disease — use splitTextToSize so long strings wrap instead of truncating
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text("Disease", M + 90, cy);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
        const diseaseLines = pdf.splitTextToSize(params.disease, 85);
        pdf.text(diseaseLines, M + 90, cy + 4);
        const diseaseBlockH = 4 + diseaseLines.length * 4; // label offset + wrapped lines
        // Platelets starts below the full disease block
        const platY = cy + diseaseBlockH + 1;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text("Platelets", M + 90, platY);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
        pdf.text(fmtVal(params.platelets, "K/µL"), M + 90, platY + 4);
        cy = platY + 11;
      }
      y = cy + 4;

      // ── TARGET TRIAL ──
      y = sectionHead("Target Trial", y + 6);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
      const titleLines = pdf.splitTextToSize(trialTitle, CW);
      pdf.text(titleLines, M, y);
      y += 4 + titleLines.length * 4;
      cy = y;
      cy = labelVal("NCT ID", trialNct, M, cy, TEXT_ACCENT);
      cy = labelVal("Sponsor", trialSponsor, M, cy);
      cy = y;
      cy = labelVal("Phase", trialPhase, M + 90, cy);
      cy = labelVal("Status", protocol.statusModule.overallStatus, M + 90, cy, GREEN);
      y = cy + 4;
      // Location / Facility — full-width row
      const loc = protocol.contactsLocationsModule?.locations?.[0];
      const primarySite = loc
        ? [loc.city, loc.state, loc.country].filter(Boolean).join(", ")
        : null;
      if (primarySite) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text("Location / Facility", M, y);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
        const locLines = pdf.splitTextToSize(`Primary Site: ${primarySite}`, CW);
        pdf.text(locLines, M, y + 4);
        y += 4 + locLines.length * 4 + 1;
      }

      // ── ELIGIBILITY RATIONALE ──
      y = sectionHead("Eligibility Rationale & Match Score", y + 2);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(badgeRGB[0], badgeRGB[1], badgeRGB[2]);
      pdf.text(`${matchPct}% — ${catLabel}`, M, y);
      y += 7;

      const statRow = (label: string, val: string, yy: number) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
        pdf.text(label, M, yy);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
        const vw = pdf.getTextWidth(val);
        pdf.text(val, 210 - M - vw, yy);
        divider(yy + 2);
      };
      statRow("Inclusion criteria satisfied", `${checkedInc} / ${criteria.inclusion.length}`, y);
      y += 7;
      statRow(
        "Exclusion criteria cleared",
        criteria.exclusion.length > 0 ? `${uncheckedExc} / ${criteria.exclusion.length}` : "None listed — not penalized",
        y,
      );
      y += 7;
      statRow("Custom lab rules satisfied", `${satisfiedCust} / ${customRules.length}`, y);
      y += 9;

      // ── INCLUSION CHECKLIST ──
      if (criteria.inclusion.length > 0) {
        y = sectionHead(
          `Core Criteria Checklist — Inclusion (${checkedInc}/${criteria.inclusion.length})`,
          y,
        );
        // Only the top 3 items are rendered on Page 1 so long text blocks never
        // overlap or clip at the bottom page footer.
        const page1Inclusion = criteria.inclusion.slice(0, 3);
        for (let i = 0; i < page1Inclusion.length; i++) {
          // Early page break: if the current item would push y close to the 260mm safe zone, wrap early
          if (y > 260) {
            pdf.addPage();
            fillBg();
            y = M + 5;
          }
          const isMet = inclusionMap[i];
          const icon = isMet ? "✓ " : "✗ ";
          // Green for met, red for unmet
          pdf.setTextColor(isMet ? GREEN[0] : RED[0], isMet ? GREEN[1] : RED[1], isMet ? GREEN[2] : RED[2]);
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(8);
          // Icon at left margin
          pdf.text(icon, M, y);
          // Criterion text — white, wrapped, offset to the right of icon
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
          const criterionWidth = CW - 8; // 180 - 8mm for icon offset
          const lines = pdf.splitTextToSize(page1Inclusion[i], criterionWidth);
          pdf.text(lines, M + 6, y);
          // Advance yPos by number of wrapped lines (each ~3.5mm with 1.35 line height)
          y += 2 + lines.length * 3.5;
        }
      }

      // Page 1 footer
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(FOOTER_CLR[0], FOOTER_CLR[1], FOOTER_CLR[2]);
      divider(285);
      pdf.text("Page 1 of 2 — Generated by Aethel Bio", M, 291);

      // ════════════════ PAGE 2 ════════════════
      pdf.addPage();
      fillBg();
      y = 25; // 25mm top margin to avoid header collision

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
      pdf.text("Aethel Bio — Clinical Referral Summary", M, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      pdf.text(dateStrFull, M, y);
      y += 5;
      divider(y);
      y += 8;

      y = sectionHead("Principal Investigator Outreach Draft", y);

      // The mutations variable already runs through normalizeMutationForOutreach(),
      // which converts "p. Gin1756Profs" → "p.Gln1756Profs*74"
      const letterBody = [
        `Dear Principal Investigator,`,
        ``,
        `I am writing to refer a patient for consideration in the ${trialTitle} (${trialNct}).`,
        ``,
        `The patient presents with ${params.disease} and carries the ${mutations} mutation. Key laboratory values — eGFR ${fmtVal(params.egfr, "mL/min")}, platelets ${fmtVal(params.platelets, "K/µL")} — fall within the study's anticipated parameters.`,
        ``,
        `Eligibility assessment yielded a ${matchPct}% match (${catLabel}), with ${checkedInc} of ${criteria.inclusion.length} inclusion criteria met and ${uncheckedExc} of ${criteria.exclusion.length} exclusion criteria cleared.`,
        ``,
        `Please find the full patient profile and eligibility checklist attached. I welcome the opportunity to discuss this case further and provide any additional documentation required.`,
        ``,
        `Respectfully,`,
        `Aethel Bio — AI Clinical Trial Matching`,
      ].join("\n");

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      const letterLines = pdf.splitTextToSize(letterBody, CW);
      pdf.text(letterLines, M, y, { maxWidth: CW });

      // Page 2 footer
      pdf.setFontSize(8);
      pdf.setTextColor(FOOTER_CLR[0], FOOTER_CLR[1], FOOTER_CLR[2]);
      divider(285);
      pdf.text("Page 2 of 2 — Generated by Aethel Bio", M, 291);

      pdf.save(`Clinical_Referral_Summary_${trialNct}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  }, [protocol, params, inclusionMap, exclusionMap, criteria, customRules, score, cat.label]);

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
                {/* Location */}
                {(protocol.contactsLocationsModule?.locations?.[0]) && (
                  <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <div>
                      <span className="text-xs text-text-muted">Location / Facility</span>
                      <p className="font-medium text-text-primary">
                        {(() => {
                          const l = protocol.contactsLocationsModule!.locations![0];
                          return ["Primary Site:", l.city, l.state, l.country].filter(Boolean).join(" ");
                        })()}
                      </p>
                    </div>
                  </div>
                )}
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
              {cat.label === "Ineligible / Organ System Mismatch" && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-destructive-muted px-3 py-1.5 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Organ System Mismatch — This trial targets a different organ system from the patient's disease — score capped at 0%
                </div>
              )}
              {cat.label === "Ineligible / Unmet Inclusion Criteria" && (
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
                    {criteria.exclusion.length > 0
                      ? `${uncheckedExclusionCount} / ${criteria.exclusion.length}`
                      : "None listed — not penalized"}
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

      {/* ── Printable Print Overlay — REMOVED; pure jsPDF used instead ── */}
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
                Export Clinical Referral Summary
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