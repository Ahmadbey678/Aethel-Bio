/**
 * Patient Profile scoring against trial eligibility criteria.
 * Produces a match score (0-100) and detailed per-criteria results.
 */

import type { ParsedCriteria } from "./criteriaClient";

/* ── Types ─────────────────────────────────────────── */

export interface PatientProfileInput {
  cancerStage: string;
  ecog: string;
  priorTreatmentLines: string;
  comorbidities: string;
  age?: string;
  sex?: string;
}

export interface CriterionResult {
  text: string;
  met: boolean;
  reason: string;
  type: "inclusion" | "exclusion";
}

export interface MatchResult {
  score: number; // 0-100
  overallLabel: string;
  inclusionSatisfied: number;
  inclusionTotal: number;
  exclusionCleared: number;
  exclusionTotal: number;
  details: CriterionResult[];
  hardGateFailed: boolean;
  hardGateReason: string | null;
}

/* ── Scoring Logic ─────────────────────────────────── */

/**
 * Score a trial's eligibility criteria against a patient profile.
 */
export function scoreTrialAgainstProfile(
  criteria: ParsedCriteria,
  profile: PatientProfileInput,
  trialTitle: string,
  trialConditions: string[],
  biomarker: string,
  condition: string,
): MatchResult {
  const details: CriterionResult[] = [];
  let inclusionSatisfied = 0;
  let exclusionCleared = 0;
  let hardGateFailed = false;
  let hardGateReason: string | null = null;

  const ecogNum = parseECOG(profile.ecog);
  const priorLines = parsePriorLines(profile.priorTreatmentLines);
  const profileWords = new Set([
    ...biomarker.toLowerCase().split(/\s+/),
    ...condition.toLowerCase().split(/\s+/),
    ...trialConditions.join(" ").toLowerCase().split(/\s+/),
  ]);

  // Score inclusion criteria
  for (const criterion of criteria.inclusion) {
    const result = evaluateInclusionCriterion(criterion, profile, ecogNum, priorLines, profileWords, biomarker, condition);
    details.push(result);
    if (result.met) inclusionSatisfied++;
  }

  // Score exclusion criteria
  for (const criterion of criteria.exclusion) {
    const result = evaluateExclusionCriterion(criterion, profile, ecogNum, priorLines);
    details.push(result);
    if (result.met) exclusionCleared++;
  }

  const inclusionTotal = criteria.inclusion.length;
  const exclusionTotal = criteria.exclusion.length;

  // Hard gate: ECOG > 2 is an almost universal exclusion
  if (ecogNum !== null && ecogNum > 2) {
    hardGateFailed = true;
    hardGateReason = "ECOG performance status > 2 is an exclusion for most oncology trials";
  }

  // Calculate score
  let score = 0;
  if (inclusionTotal > 0) {
    score = Math.round((inclusionSatisfied / inclusionTotal) * 100);
  } else if (exclusionTotal > 0) {
    // No inclusion criteria — score based on exclusion clearance
    score = Math.round((exclusionCleared / exclusionTotal) * 100);
  } else {
    score = 50; // No criteria to evaluate — neutral
  }

  if (hardGateFailed) score = 0;

  // Overall label
  let overallLabel: string;
  if (hardGateFailed) {
    overallLabel = "Likely Ineligible";
  } else if (score >= 80) {
    overallLabel = "Strong Match";
  } else if (score >= 50) {
    overallLabel = "Moderate Match";
  } else if (score >= 20) {
    overallLabel = "Weak Match";
  } else {
    overallLabel = "Low Likelihood";
  }

  return {
    score,
    overallLabel,
    inclusionSatisfied,
    inclusionTotal,
    exclusionCleared,
    exclusionTotal,
    details,
    hardGateFailed,
    hardGateReason,
  };
}

/* ── Helper: Evaluate a single inclusion criterion ── */

function evaluateInclusionCriterion(
  criterion: string,
  profile: PatientProfileInput,
  ecogNum: number | null,
  priorLines: number | null,
  profileWords: Set<string>,
  biomarker: string,
  condition: string,
): CriterionResult {
  const lower = criterion.toLowerCase();
  const bioLower = biomarker.toLowerCase();
  const condLower = condition.toLowerCase();

  // ECOG check
  const ecogMatch = lower.match(/ecog\s*([<>=]+\s*\d+|performance\s*status\s*([<>=]+\s*\d+|of\s*\d+))/i);
  if (ecogMatch && ecogNum !== null) {
    // Extract threshold
    const thresholdMatch = ecogMatch[0].match(/(\d+)/);
    if (thresholdMatch) {
      const threshold = parseInt(thresholdMatch[1], 10);
      if (lower.includes("<=") || lower.includes("≤") || lower.includes("0-")) {
        const maxVal = parseInt(lower.match(/(\d+)/)?.[1] || "0", 10);
        if (ecogNum <= maxVal) {
          return { text: criterion, met: true, reason: `Patient ECOG ${ecogNum} ≤ ${maxVal}`, type: "inclusion" };
        }
        return { text: criterion, met: false, reason: `Patient ECOG ${ecogNum} > ${maxVal}`, type: "inclusion" };
      }
      if (ecogNum <= threshold) {
        return { text: criterion, met: true, reason: `Patient ECOG ${ecogNum} meets threshold`, type: "inclusion" };
      }
      return { text: criterion, met: false, reason: `Patient ECOG ${ecogNum} exceeds threshold`, type: "inclusion" };
    }
  }

  // Biomarker match
  if (bioLower.length > 2 && lower.includes(bioLower)) {
    return { text: criterion, met: true, reason: `Matches patient biomarker: ${biomarker}`, type: "inclusion" };
  }

  // Match on biomarker partials (gene name)
  const geneMatch = bioLower.split(/\s+/)[0];
  if (geneMatch && geneMatch.length > 2 && lower.includes(geneMatch)) {
    return { text: criterion, met: true, reason: `Matches patient gene: ${geneMatch}`, type: "inclusion" };
  }

  // Disease match
  if (condLower.length > 2) {
    const condParts = condLower.split(/\s+/);
    const condMatch = condParts.some((p: string) => p.length > 2 && lower.includes(p));
    if (condMatch) {
      return { text: criterion, met: true, reason: `Matches patient condition: ${condition}`, type: "inclusion" };
    }
  }

  // Cancer stage match
  if (profile.cancerStage && lower.includes("stage")) {
    const stageNum = profile.cancerStage.match(/\d+/);
    const critStage = lower.match(/stage\s*([iv]+|\d+)/i);
    if (stageNum && critStage) {
      return { text: criterion, met: true, reason: `Patient stage ${profile.cancerStage}`, type: "inclusion" };
    }
  }

  // Broad criteria that are usually auto-met (consent, age, histology)
  if (/informed\s*consent|histolog(ically|y)\s*confirmed|life\s*expectancy|measurable\s*disease/i.test(lower)) {
    return { text: criterion, met: true, reason: "Standard clinical trial criterion — assumed satisfied", type: "inclusion" };
  }

  // Prior treatment line check
  if (priorLines !== null && /prior\s*(treatment|therapy|systemic|chemotherap)/i.test(lower)) {
    if (/no\s*prior|naive|untreated/i.test(lower)) {
      // Trial requires no prior treatment
      if (priorLines === 0) {
        return { text: criterion, met: true, reason: "Treatment-naive patient", type: "inclusion" };
      }
      return { text: criterion, met: false, reason: `Patient has ${priorLines} prior treatment line(s)`, type: "inclusion" };
    }
    // Trial allows some prior treatment
    return { text: criterion, met: true, reason: `Patient has ${priorLines} prior line(s), meets criteria`, type: "inclusion" };
  }

  // Default: uncertain — score neutrally
  return { text: criterion, met: true, reason: "No conflict detected with patient profile", type: "inclusion" };
}

/* ── Helper: Evaluate a single exclusion criterion ── */

function evaluateExclusionCriterion(
  criterion: string,
  profile: PatientProfileInput,
  ecogNum: number | null,
  priorLines: number | null,
): CriterionResult {
  const lower = criterion.toLowerCase();

  // ECOG > 2 exclusion
  if (ecogNum !== null) {
    const ecogMatch = lower.match(/ecog\s*(>\s*2|>\s*=\s*3|performance\s*status\s*>\s*2)/i);
    if (ecogMatch && ecogNum <= 2) {
      return { text: criterion, met: true, reason: `Patient ECOG ${ecogNum} — not excluded`, type: "exclusion" };
    }
  }

  // Comorbidity check
  const comorbLower = profile.comorbidities.toLowerCase();
  const comorbidityKeywords = [
    { keyword: "diabetes", label: "uncontrolled diabetes" },
    { keyword: "cardiac|heart|cardiovascular", label: "cardiac condition" },
    { keyword: "hepatic|liver", label: "liver disease" },
    { keyword: "renal|kidney", label: "renal impairment" },
    { keyword: "hiv", label: "HIV" },
    { keyword: "hepatitis", label: "hepatitis" },
    { keyword: "autoimmune", label: "autoimmune disease" },
    { keyword: "infection", label: "active infection" },
  ];

  for (const { keyword, label } of comorbidityKeywords) {
    if (new RegExp(keyword, "i").test(lower)) {
      if (comorbLower.includes(keyword.replace(/\|.*/, "").trim())) {
        return { text: criterion, met: false, reason: `Patient has: ${label}`, type: "exclusion" };
      }
      return { text: criterion, met: true, reason: `No ${label} indicated`, type: "exclusion" };
    }
  }

  // Prior treatment exclusion
  if (priorLines !== null && /prior\s*(chemotherap|treatment|therapy|immunotherap|targeted)/i.test(lower)) {
    if (priorLines > 0) {
      return { text: criterion, met: false, reason: `Patient has ${priorLines} prior treatment line(s)`, type: "exclusion" };
    }
    return { text: criterion, met: true, reason: "Treatment-naive patient", type: "exclusion" };
  }

  // Pregnancy / breastfeeding — assumed not applicable
  if (/pregnan|breastfeed|lactat/i.test(lower)) {
    return { text: criterion, met: true, reason: "Assumed not applicable", type: "exclusion" };
  }

  // Default: not excluded
  return { text: criterion, met: true, reason: "No conflict detected", type: "exclusion" };
}

/* ── Parsing helpers ───────────────────────────────── */

function parseECOG(ecog: string): number | null {
  if (!ecog || ecog === "not specified") return null;
  const match = ecog.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function parsePriorLines(lines: string): number | null {
  if (!lines || lines === "not specified") return null;
  const match = lines.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}