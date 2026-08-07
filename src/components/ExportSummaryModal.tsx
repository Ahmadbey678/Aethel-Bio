import { useCallback, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import {
  X,
  FileText,
  Check,
  Copy,
  Loader2,
  HeartPulse,
  CheckCircle,
  AlertTriangle,
  Gauge,
  MapPin,
  Dna,
  Brain,
  FlaskConical,
  Languages,
  CircleHelp,
  Activity,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ParsedCriteria } from "../trialScoring";
import type { StudyProtocol, PatientProfile } from "../types";

/* ── Types ─────────────────────────────────────────── */

export interface CustomRule {
  id: string;
  text: string;
  satisfied: boolean;
  required?: boolean;
}

export interface MatchCategory {
  label: string;
  color: string;
  bg: string;
  border: string;
}

interface ExportSummaryModalProps {
  study: StudyProtocol;
  patientProfile: PatientProfile;
  inclusionMap: Record<number, boolean>;
  exclusionMap: Record<number, boolean>;
  customRules: CustomRule[];
  score: number;
  cat: MatchCategory;
  criteria: ParsedCriteria;
  onClose: () => void;
}

type ExportView = "physician" | "patient";

const VIEWS: ExportView[] = ["physician", "patient"];

/* ── OCR / text normalisation for outreach ──────────── */

function normalizeMutationForOutreach(text: string): string {
  return text
    .replace(/p\.\s*Gin\b/g, "p.Gln")                    // "p. Gin" → "p.Gln"
    .replace(/(Profs)\s+(\d+)/g, "$1*$2");               // "Profs 74" → "Profs*74"
}

/* ── Plain-language translations ────────────────────── */

/** Classify a phase label ("Phase 2", "PHASEIII", …) into a stage. */
function phaseKind(phaseLabel: string): "I" | "II" | "III" | "IV" | "other" {
  const k = phaseLabel.toLowerCase().replace(/\s+/g, "");
  if (k.includes("phaseiv") || k.includes("phase4")) return "IV";
  if (k.includes("phaseiii") || k.includes("phase3")) return "III";
  if (k.includes("phaseii") || k.includes("phase2")) return "II";
  if (k.includes("phasei") || k.includes("phase1")) return "I";
  return "other";
}

interface GlossaryEntry {
  term: string;
  plain: string;
}

interface GlossaryBuild {
  entries: GlossaryEntry[];
  phaseLabel: string;
  clinicalPhaseTerm: string;
  phasePlain: string;
}

function buildGlossary(p: StudyProtocol["protocolSection"], profile: PatientProfile): GlossaryBuild {
  const phases = p.designModule?.phases ?? [];
  const phaseLabel = phases.length
    ? phases.map((ph) => ph.replace("PHASE", "Phase ")).join("/")
    : "N/A";
  const kind = phaseKind(phaseLabel);
  const clinicalPhaseTerm =
    kind === "I"
      ? "Phase I Trial"
      : kind === "II"
        ? "Phase II Trial"
        : kind === "III"
          ? "Phase III Trial"
          : kind === "IV"
            ? "Phase IV Trial"
            : phaseLabel !== "N/A"
              ? `${phaseLabel} Trial`
              : "Clinical Trial";
  const phasePlain =
    kind === "I"
      ? "An early-stage clinical study whose main goal is safety — finding the right dose and checking how the body responds to the treatment."
      : kind === "II"
        ? "Focuses on testing how effective the treatment is for your specific tumor profile."
        : kind === "III"
          ? "A large-scale study comparing this treatment with the current standard of care, usually before it can be considered for approval."
          : kind === "IV"
            ? "A study that continues after approval, tracking long-term safety and effectiveness in a broader group of patients."
            : "A clinical study investigating the safety and effectiveness of a treatment.";

  const mutation = profile.extractedParams.mutation || "EGFR T790M";
  return {
    phaseLabel,
    clinicalPhaseTerm,
    phasePlain,
    entries: [
      { term: clinicalPhaseTerm, plain: phasePlain },
      {
        term: `Target Variant (${mutation})`,
        plain: `Matches your ${mutation} gene alteration.`,
      },
      {
        term: "Primary Endpoint: PFS",
        plain: "Main study goal: Measuring how long the treatment keeps the tumor stable.",
      },
      {
        term: "Eligibility Criteria",
        plain: "The checklist of health requirements that participants must meet to join the study.",
      },
      {
        term: "Sponsor",
        plain: "The organization — often a pharmaceutical company or research group — that runs and funds the study.",
      },
    ],
  };
}

/* ── Care team checklist — questions to ask your doctor ── */

const CARE_TEAM_QUESTIONS: { icon: LucideIcon; question: string }[] = [
  {
    icon: MapPin,
    question: "Is this trial recruiting at a hospital near my zip code?",
  },
  {
    icon: Activity,
    question: "What are the expected visit frequencies and side effects?",
  },
  {
    icon: Wallet,
    question: "Are travel or lodging stipends available for participants?",
  },
];

/* ── Main Component ────────────────────────────────── */

export default function ExportSummaryModal({
  study,
  patientProfile,
  inclusionMap,
  exclusionMap,
  customRules,
  score,
  cat,
  criteria,
  onClose,
}: ExportSummaryModalProps) {
  const [view, setView] = useState<ExportView>("physician");
  const [copied, setCopied] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const tabRefs = useRef<Record<ExportView, HTMLButtonElement | null>>({
    physician: null,
    patient: null,
  });

  const protocol = study.protocolSection;
  const params = patientProfile.extractedParams;
  const fmtL = (val: number | null, unit: string) => (val !== null ? `${val} ${unit}` : "N/A");
  const glossary = buildGlossary(protocol, patientProfile);

  const checkedInclusionCount = criteria.inclusion.filter((_, i) => inclusionMap[i]).length;
  const uncheckedExclusionCount = criteria.exclusion.filter((_, i) => !exclusionMap[i]).length;
  const satisfiedCustomCount = customRules.filter((r) => r.satisfied).length;

  const matchSentence =
    score >= 80
      ? "This trial appears to be a strong match for your profile. Your care team can confirm whether you meet the remaining requirements."
      : score >= 50
        ? "This trial may be a reasonable fit. Some eligibility requirements are borderline, so it is worth discussing with your care team."
        : "This trial is a weak match for your profile based on the eligibility checklist. Your care team can help you identify more suitable options.";

  /* ── Tab switching (roving tabindex + focus) ── */
  const switchView = (next: ExportView) => {
    setView(next);
    setCopied(false);
    tabRefs.current[next]?.focus();
  };

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = VIEWS.indexOf(view);
    let next: ExportView | null = null;
    if (e.key === "ArrowRight") next = VIEWS[(idx + 1) % VIEWS.length];
    else if (e.key === "ArrowLeft") next = VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length];
    else if (e.key === "Home") next = VIEWS[0];
    else if (e.key === "End") next = VIEWS[VIEWS.length - 1];
    if (next) {
      e.preventDefault();
      switchView(next);
    }
  };

  /* ── Copy text (per view) ── */
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
    `Phase: ${glossary.phaseLabel}`,
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

  const patientSummaryText = useMemo(() => {
    const qs = CARE_TEAM_QUESTIONS.map((q) => `• ${q.question}`);
    return [
      "AETHEL BIO — PATIENT TRIAL SUMMARY",
      `Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      "",
      "THIS STUDY AT A GLANCE",
      `Trial: ${protocol.identificationModule.briefTitle} (${protocol.identificationModule.nctId})`,
      `Sponsor: ${protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}`,
      `Phase: ${glossary.clinicalPhaseTerm}`,
      "",
      "WHAT THIS STUDY IS ABOUT",
      `This is a ${glossary.clinicalPhaseTerm} for patients with ${params.disease}. ${glossary.phasePlain}`,
      "",
      "TRIAL TERMS, EXPLAINED",
      ...glossary.entries.map((g) => `• ${g.term}: ${g.plain}`),
      "",
      "YOUR MATCH AT A GLANCE",
      `Aethel Bio estimated a ${Math.round(score)}% match (${cat.label}) between your profile and this trial's eligibility checklist. ${matchSentence}`,
      "",
      "QUESTIONS TO ASK YOUR DOCTOR",
      ...qs,
      "",
      "Please share this summary with your care team when deciding whether this trial is right for you. This document is a plain-language guide and is not medical advice.",
    ].join("\n");
  }, [protocol, params, glossary, score, cat.label, matchSentence]);

  const handleCopy = async () => {
    const text = view === "physician" ? referralText : patientSummaryText;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: create a hidden textarea, copy via execCommand
      const textarea = document.createElement("textarea");
      textarea.value = text;
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

  /* Physician Dossier — 2-page clinical referral document */
  const generatePhysicianPdf = useCallback(async () => {
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
    const trialPhase = glossary.phaseLabel;

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
    pdf.text("Aethel Bio — Physician Dossier", M, y);
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
    pdf.text("Aethel Bio — Physician Dossier", M, y);
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

    pdf.save(`Physician_Dossier_${trialNct}.pdf`);
  }, [protocol, params, inclusionMap, exclusionMap, criteria, customRules, score, cat.label, glossary.phaseLabel]);

  /* Patient Summary — single plain-language document */
  const generatePatientPdf = useCallback(async () => {
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const M = 15;
    const CW = 180;

    const BG_RGB: [number, number, number] = [11, 15, 25];
    const TEXT_WHITE: [number, number, number] = [248, 250, 252];
    const TEXT_MUTED: [number, number, number] = [148, 163, 184];
    const TEXT_ACCENT: [number, number, number] = [56, 189, 248];
    const GREEN: [number, number, number] = [34, 197, 94];
    const DIVIDER_CLR: [number, number, number] = [30, 41, 59];
    const FOOTER_CLR: [number, number, number] = [71, 85, 105];

    const fillBg = () => {
      pdf.setFillColor(BG_RGB[0], BG_RGB[1], BG_RGB[2]);
      pdf.rect(0, 0, 210, 297, "F");
    };

    pdf.setFont("helvetica", "normal");
    pdf.setCharSpace(0);
    pdf.setLineHeightFactor(1.35);
    fillBg();

    let y = M + 5;

    const sectionHead = (text: string, yy: number) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
      pdf.text(text.toUpperCase(), M, yy);
      pdf.setDrawColor(DIVIDER_CLR[0], DIVIDER_CLR[1], DIVIDER_CLR[2]);
      pdf.line(M, yy + 2, 210 - M, yy + 2);
      return yy + 9;
    };

    const ensure = (needed: number) => {
      if (y + needed > 272) {
        pdf.addPage();
        fillBg();
        y = M + 5;
      }
    };

    // ── Header ──
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
    pdf.text("Aethel Bio - Patient Trial Summary", M, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    pdf.text(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), M, y);
    y += 5;
    pdf.setDrawColor(DIVIDER_CLR[0], DIVIDER_CLR[1], DIVIDER_CLR[2]);
    pdf.line(M, y, 210 - M, y);
    y += 8;

    const trialTitle = protocol.identificationModule.briefTitle;
    const trialNct = protocol.identificationModule.nctId;
    const trialSponsor = protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown";

    // ── This study at a glance ──
    ensure(26);
    y = sectionHead("This study at a glance", y);
    const glanceRows: [string, string][] = [
      ["Trial", trialTitle],
      ["NCT ID", trialNct],
      ["Sponsor", trialSponsor],
      ["Phase", `${glossary.clinicalPhaseTerm} - ${glossary.phasePlain}`],
      ["Who it is for", params.disease],
    ];
    for (const [label, val] of glanceRows) {
      ensure(10);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      pdf.text(label, M, y);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
      const lines = pdf.splitTextToSize(val, CW - 42);
      pdf.text(lines, M + 42, y);
      y += 4 + lines.length * 4.5 + 1.5;
    }
    y += 4;

    // ── Trial terms, explained ──
    ensure(20);
    y = sectionHead("Trial terms, explained", y);
    for (const g of glossary.entries) {
      ensure(16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
      pdf.text(g.term, M, y);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      const glines = pdf.splitTextToSize(g.plain, CW - 8);
      pdf.text(glines, M + 4, y + 4.5);
      y += 5 + glines.length * 4.5;
    }
    y += 3;

    // ── Your match at a glance ──
    ensure(24);
    y = sectionHead("Your match at a glance", y);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    pdf.text(`${Math.round(score)}% match - ${cat.label}`, M, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(TEXT_WHITE[0], TEXT_WHITE[1], TEXT_WHITE[2]);
    const matchLines = pdf.splitTextToSize(matchSentence, CW);
    pdf.text(matchLines, M, y);
    y += 4 + matchLines.length * 4.5 + 3;

    // ── Questions to ask your doctor ──
    ensure(24);
    y = sectionHead("Questions to ask your doctor", y);
    for (const q of CARE_TEAM_QUESTIONS) {
      ensure(16);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(TEXT_ACCENT[0], TEXT_ACCENT[1], TEXT_ACCENT[2]);
      const qlines = pdf.splitTextToSize(`? ${q.question}`, CW - 6);
      pdf.text(qlines, M, y);
      y += 4 + qlines.length * 4.5;
    }
    y += 6;

    // ── Footer disclaimer ──
    ensure(20);
    pdf.setDrawColor(DIVIDER_CLR[0], DIVIDER_CLR[1], DIVIDER_CLR[2]);
    pdf.line(M, y, 210 - M, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(FOOTER_CLR[0], FOOTER_CLR[1], FOOTER_CLR[2]);
    const disc = pdf.splitTextToSize(
      "This summary is a plain-language guide to help you and your care team discuss this trial. It is not medical advice and does not guarantee eligibility.",
      CW,
    );
    pdf.text(disc, M, y);

    pdf.save(`Patient_Summary_${trialNct}.pdf`);
  }, [protocol, params, glossary, score, cat.label, matchSentence]);

  const handleDownload = async () => {
    setPdfGenerating(true);
    try {
      if (view === "physician") await generatePhysicianPdf();
      else await generatePatientPdf();
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfGenerating(false);
    }
  };

  const downloadLabel =
    view === "physician" ? "Download Physician Dossier PDF" : "📄 Download Patient Summary PDF";
  const downloadShort = view === "physician" ? "Dossier PDF" : "📄 Summary PDF";
  const copyLabel = view === "physician" ? "Copy Dossier" : "Copy Summary";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm; }
      `}</style>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          tabIndex={-1}
          className="animate-scale-in relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border-subtle bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Modal Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-6 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-accent" />
              <div>
                <h2 id="export-modal-title" className="font-heading text-base font-semibold text-text-primary">
                  Clinical Referral Summary
                </h2>
                <p className="text-[11px] text-text-muted">Physician dossier &amp; patient-facing summary</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Segmented Control (tablist) — right below the title ── */}
          <div className="flex shrink-0 justify-center px-6 pt-4">
            <div
              role="tablist"
              aria-label="Export view"
              className="flex w-full gap-1 rounded-full border border-border-subtle bg-surface p-1 sm:w-auto"
            >
              <button
                id="tab-physician"
                type="button"
                role="tab"
                aria-selected={view === "physician"}
                aria-controls="panel-physician"
                tabIndex={view === "physician" ? 0 : -1}
                ref={(el) => { tabRefs.current.physician = el; }}
                onClick={() => switchView("physician")}
                onKeyDown={onTabKeyDown}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer sm:flex-none ${
                  view === "physician"
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <span aria-hidden="true">🩺</span>
                Physician Dossier
              </button>
              <button
                id="tab-patient"
                type="button"
                role="tab"
                aria-selected={view === "patient"}
                aria-controls="panel-patient"
                tabIndex={view === "patient" ? 0 : -1}
                ref={(el) => { tabRefs.current.patient = el; }}
                onClick={() => switchView("patient")}
                onKeyDown={onTabKeyDown}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 cursor-pointer sm:flex-none ${
                  view === "patient"
                    ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                    : "border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                <span aria-hidden="true">👤</span>
                Patient-Friendly Summary
              </button>
            </div>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {view === "physician" ? (
              <div
                key="physician"
                id="panel-physician"
                role="tabpanel"
                aria-labelledby="tab-physician"
                className="animate-fade-in-up space-y-5"
              >
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
                      <p className="font-medium text-text-primary">{glossary.phaseLabel}</p>
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
                    {protocol.contactsLocationsModule?.locations?.[0] && (
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
            ) : (
              <div
                key="patient"
                id="panel-patient"
                role="tabpanel"
                aria-labelledby="tab-patient"
                className="animate-fade-in-up space-y-5"
              >
                {/* Intro */}
                <section className="rounded-xl border border-accent/25 bg-accent-muted/10 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent">
                    <HeartPulse className="h-4 w-4" />
                    What This Clinical Trial Means for You
                  </h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Here is what this trial is about, in plain language, so you and your care team can
                    talk through whether it is a good fit. Share this page with your oncologist or
                    nurse before your next appointment.
                  </p>
                </section>

                {/* This study at a glance */}
                <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                    <FlaskConical className="h-4 w-4" />
                    This study at a glance
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-text-muted">Trial</dt>
                      <dd className="font-medium leading-snug text-text-primary">
                        {protocol.identificationModule.briefTitle}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4">
                      <div>
                        <dt className="text-xs text-text-muted">NCT ID</dt>
                        <dd className="font-mono font-medium text-primary">{protocol.identificationModule.nctId}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-text-muted">Sponsor</dt>
                        <dd className="font-medium text-text-primary">
                          {protocol.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown"}
                        </dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">What it studies</dt>
                      <dd className="font-medium text-text-primary">
                        {glossary.clinicalPhaseTerm} — {glossary.phasePlain}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-text-muted">Who it is for</dt>
                      <dd className="font-medium text-text-primary">
                        Patients with {params.disease}
                      </dd>
                    </div>
                  </dl>
                </section>

                {/* Trial terms, explained */}
                <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Languages className="h-4 w-4" />
                    Trial terms, explained
                  </h3>
                  <ul className="space-y-3">
                    {glossary.entries.map((g) => (
                      <li key={g.term} className="rounded-lg border border-border-subtle bg-surface px-3.5 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{g.term}</p>
                        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{g.plain}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Your match at a glance */}
                <section className="rounded-xl border border-border-subtle bg-surface-raised p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Gauge className="h-4 w-4" />
                    Your match at a glance
                  </h3>
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cat.bg} ${cat.color}`}>
                      {Math.round(score)}% — {cat.label}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-text-secondary">{matchSentence}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    Based on the eligibility checklist, {checkedInclusionCount} of {criteria.inclusion.length} inclusion
                    requirements are met. Your care team can confirm the rest.
                  </p>
                </section>

                {/* Care Team Checklist — Questions to Ask Your Doctor */}
                <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
                    <CircleHelp className="h-4 w-4" />
                    Questions to Ask Your Doctor
                  </h3>
                  <ul className="space-y-3">
                    {CARE_TEAM_QUESTIONS.map((q) => (
                      <li key={q.question} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                          <q.icon className="h-3.5 w-3.5 text-emerald-300" />
                        </span>
                        <p className="pt-1 text-sm font-medium leading-snug text-text-primary">{q.question}</p>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Next steps */}
                <section className="rounded-xl border border-accent/25 bg-accent-muted/10 p-4">
                  <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-accent">
                    <Brain className="h-4 w-4" />
                    Next steps
                  </h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Bring this summary to your next appointment and ask your care team the questions
                    above. Aethel Bio can also prepare a detailed physician dossier for your doctor.
                    This summary is a guide — it is not medical advice.
                  </p>
                </section>
              </div>
            )}
          </div>

          {/* ── Footer Actions (dynamic CTA per view) ── */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg border border-border-subtle bg-surface-raised px-4 py-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-surface-hover active:scale-[0.97] cursor-pointer"
            >
              Close
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                disabled={pdfGenerating}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-accent/80 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {pdfGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="hidden sm:inline">Generating PDF…</span>
                    <span className="sm:hidden">PDF…</span>
                  </>
                ) : (
                  <>
                    {view === "physician" && <FileText className="h-4 w-4" />}
                    <span className="hidden sm:inline">{downloadLabel}</span>
                    <span className="sm:hidden">{downloadShort}</span>
                  </>
                )}
              </button>
              <button
                onClick={handleCopy}
                className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                  copied
                    ? "border-success/40 bg-success-muted text-success"
                    : "border-accent/30 bg-accent-muted/15 text-accent hover:bg-accent-muted/30"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span className="hidden sm:inline">Copied!</span>
                    <span className="sm:hidden">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span className="hidden sm:inline">{copyLabel}</span>
                    <span className="sm:hidden">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
