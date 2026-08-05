/**
 * Shared trial-scoring engine.
 *
 * Extracted from TrialMatchSimulator.tsx so the same eligibility parsing /
 * auto-matching / hard-gate / scoring logic can run for a single trial (the
 * match-simulator drawer) AND be batch-run across every search result (to
 * detect "no trial scored above threshold" for the Unmatched Registry)
 * without duplicating the logic in two places.
 */

/* ── Minimal structural types ─────────────────────────
   Both App.tsx's and TrialMatchSimulator.tsx's StudyProtocol/PatientProfile
   types are supersets of these — TypeScript structural typing lets either be
   passed in directly. */

export interface ScorableStudyProtocol {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
    };
    conditionsModule?: {
      conditions?: string[];
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
    };
  };
}

export interface ScoringExtractedParams {
  mutation: string;
  disease: string;
  egfr: number | null;
  platelets: number | null;
  noBrainMets: boolean;
}

export interface ScoringPatientProfile {
  extractedParams: ScoringExtractedParams;
}

export interface ParsedCriteria {
  inclusion: string[];
  exclusion: string[];
}

export interface MatchCategory {
  label: string;
  color: string;
  bg: string;
  border: string;
}

export interface ScoreTrialResult {
  score: number;
  cat: MatchCategory;
  criteria: ParsedCriteria;
  inclusionMap: Record<number, boolean>;
  exclusionMap: Record<number, boolean>;
  hardGatePassed: boolean;
  isOrganMismatch: boolean;
  isBreastOvarianMismatch: boolean;
  /** False when ClinicalTrials.gov listed zero exclusion criteria for this trial — the score is never penalized for that. */
  exclusionCriteriaPresent: boolean;
}

/* ── Match category helpers ────────────────────────── */

export function getMatchCategory(score: number): MatchCategory {
  if (score >= 80) {
    return { label: "High Candidate Match", color: "text-success", bg: "bg-success-muted", border: "border-success/30" };
  }
  if (score >= 50) {
    return { label: "Moderate Candidate Match", color: "text-warning", bg: "bg-warning-muted", border: "border-warning/30" };
  }
  return { label: "Low Candidate Match", color: "text-destructive", bg: "bg-destructive-muted", border: "border-destructive/30" };
}

export function getGaugeColor(score: number): string {
  if (score >= 80) return "stroke-success";
  if (score >= 50) return "stroke-warning";
  return "stroke-destructive";
}

const ORGAN_MISMATCH_CATEGORY: MatchCategory = {
  label: "Ineligible / Organ System Mismatch",
  color: "text-destructive",
  bg: "bg-destructive-muted",
  border: "border-destructive/30",
};

const UNMET_INCLUSION_CATEGORY: MatchCategory = {
  label: "Ineligible / Unmet Inclusion Criteria",
  color: "text-destructive",
  bg: "bg-destructive-muted",
  border: "border-destructive/30",
};

/* ── Eligibility text parser ────────────────────────── */

export function parseEligibilityCriteria(text?: string): ParsedCriteria {
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

export function autoMatchInclusion(
  items: string[],
  patient: ScoringPatientProfile,
): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  const { mutation, disease, egfr, platelets } = patient.extractedParams;
  const diseaseLower = disease.toLowerCase();

  const isTripleNegative =
    diseaseLower.includes("triple") &&
    diseaseLower.includes("negative") &&
    diseaseLower.includes("breast");

  const mutParts = mutation.toLowerCase().split(/\s+/);
  const diseaseParts = diseaseLower.split(/\s+/);
  const diseaseKeywords = diseaseParts
    .map((p) => p.replace(/[^a-z0-9-]/g, ""))
    .filter((p) => p.length > 2);

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
    "tnbc",
    "brca",
  ];

  items.forEach((item, i) => {
    const lower = item.toLowerCase();

    if (
      isTripleNegative &&
      /hr\s*\+|hr\s*positive|hormone\s*receptor\s*positive|estrogen\s*receptor\s*positive|progesterone\s*receptor\s*positive/i.test(
        lower,
      )
    ) {
      map[i] = false;
      return;
    }

    const matchesMutation = keywords.some(
      (k) => k.length > 2 && lower.includes(k),
    );

    const hasEGFR = /egfr|gfr|creatinine|renal\s*function/.test(lower);
    const egfrMatch = hasEGFR && egfr !== null && egfr >= 60;

    const hasPlatelets = /platelet|thrombocyte|hematologic/.test(lower);
    const plateletMatch = hasPlatelets && platelets !== null && platelets >= 100;

    const broadMatch =
      /breast\s*cancer|solid\s*tumor|advanced\s*malignancy|metastatic\s*cancer/i.test(
        lower,
      ) && diseaseLower.includes("cancer");

    const brcaMatch =
      /brca1\s*\/?\s*2\s*mutation|brca\s*mutation|homologous\s*recombination/i.test(
        lower,
      ) && mutation.toLowerCase().includes("brca");

    const generalMatch =
      /informed\s*consent|medical\s*record|archival\s*tissue|histologically\s*confirmed|life\s*expectancy|ecog\s*0|ecog\s*1|measurable\s*disease/i.test(
        lower,
      );

    map[i] = matchesMutation || egfrMatch || plateletMatch || broadMatch || brcaMatch || generalMatch;
  });

  return map;
}

export function autoMatchExclusion(
  items: string[],
  patient: ScoringPatientProfile,
): Record<number, boolean> {
  const map: Record<number, boolean> = {};
  const { noBrainMets, egfr, platelets } = patient.extractedParams;

  items.forEach((item, i) => {
    const lower = item.toLowerCase();

    if (/brain\s*metasta|brain\s*tumor|cns\s*metasta/.test(lower) && noBrainMets) {
      map[i] = false;
      return;
    }

    if (/egfr\s*<\s*30|dialysis|renal\s*failure/.test(lower) && egfr !== null && egfr >= 60) {
      map[i] = false;
      return;
    }

    if (/platelet.*<\s*100|thrombocytopenia/.test(lower) && platelets !== null && platelets >= 100) {
      map[i] = false;
      return;
    }

    map[i] = false;
  });

  return map;
}

/* ── Organ-system mismatch gates ──────────────────────── */

const ORGAN_KEYWORDS = [
  "breast", "lung", "prostate", "colorect", "pancrea", "ovari", "endometri",
  "liver", "hepatocell", "gastric", "stomach", "melanoma", "glioblastoma", "glioma",
  "bladder", "renal", "head", "neck", "sarcoma", "leukemia", "lymphoma", "myeloma",
  "ovarian", "kidney", "colon", "rectal", "esophageal", "cervical", "thyroid",
];

export function computeOrganMismatch(
  p: ScorableStudyProtocol["protocolSection"],
  patient: ScoringPatientProfile,
): boolean {
  const studyConditions = p.conditionsModule?.conditions || [];
  const patientDisease = patient.extractedParams.disease.toLowerCase();
  const patientOrgan = ORGAN_KEYWORDS.find((k) => patientDisease.includes(k));

  if (patientOrgan && studyConditions.length > 0) {
    const hasMatchingOrgan = studyConditions.some((c) => {
      const cl = c.toLowerCase();
      return cl.includes(patientOrgan) ||
             (patientOrgan === "breast" && cl.includes("breast")) ||
             (patientOrgan === "lung" && cl.includes("lung")) ||
             (patientOrgan === "colorect" && (cl.includes("colon") || cl.includes("rectal") || cl.includes("colorect")));
    });
    if (!hasMatchingOrgan) return true;
  }
  return false;
}

export function computeBreastOvarianMismatch(
  p: ScorableStudyProtocol["protocolSection"],
  patient: ScoringPatientProfile,
): boolean {
  const disease = patient.extractedParams.disease.toLowerCase();
  if (!disease.includes("breast")) return false;
  const title = p.identificationModule.briefTitle.toLowerCase();
  const conditions = (p.conditionsModule?.conditions || []).join(" ").toLowerCase();
  return title.includes("ovarian") || conditions.includes("ovarian");
}

/* ── Molecular subtype weighting ──────────────────────── */

const SUBTYPE_TESTS: Record<string, RegExp> = {
  tnbc: /\btnbc\b|triple[-\s]negative/i,
  "hr+": /\bhr\s*\+|hormone\s*receptor\s*positive|estrogen\s*receptor\s*positive|\ber\s*\+/i,
  "hr-": /\bhr\s*-|hormone\s*receptor\s*negative|estrogen\s*receptor\s*negative|\ber\s*-/i,
  "her2+": /\bher2\s*\+|her2\s*positive|her2\s*amplif/i,
  "her2-": /\bher2\s*-|her2\s*negative/i,
};

function detectPatientSubtypes(patient: ScoringPatientProfile | null | undefined): Set<string> {
  if (!patient) return new Set();
  const text = `${patient.extractedParams.disease} ${patient.extractedParams.mutation}`.toLowerCase();
  const found = new Set<string>();
  for (const [tag, pattern] of Object.entries(SUBTYPE_TESTS)) {
    if (pattern.test(text)) found.add(tag);
  }
  // TNBC is definitionally HR-negative and HER2-negative.
  if (found.has("tnbc")) {
    found.add("hr-");
    found.add("her2-");
  }
  return found;
}

/** Inclusion criteria that name a molecular subtype the patient actually has are weighted 2x. */
function criterionWeight(item: string, patientSubtypes: Set<string>): number {
  const lower = item.toLowerCase();
  for (const tag of patientSubtypes) {
    if (SUBTYPE_TESTS[tag].test(lower)) return 2;
  }
  return 1;
}

/**
 * Weighted inclusion score: criteria matching a molecular subtype the patient
 * actually has count double. Falls back to a flat ratio (weight 1 for every
 * criterion) when no patient profile is supplied — this is what powers manual
 * checklist mode in the simulator drawer, where a clinician toggles criteria
 * by hand without an AI-extracted patient profile loaded.
 */
export function computeInclusionScore(
  items: string[],
  inclusionMap: Record<number, boolean>,
  patient: ScoringPatientProfile | null | undefined,
): number {
  if (items.length === 0) return 0;
  const patientSubtypes = detectPatientSubtypes(patient);

  let totalWeight = 0;
  let satisfiedWeight = 0;
  items.forEach((item, i) => {
    const weight = criterionWeight(item, patientSubtypes);
    totalWeight += weight;
    if (inclusionMap[i]) satisfiedWeight += weight;
  });

  if (totalWeight === 0) return 0;
  return Math.round((satisfiedWeight / totalWeight) * 100);
}

/* ── Top-level scorer ─────────────────────────────────── */

export function scoreTrial(
  study: ScorableStudyProtocol,
  patientProfile: ScoringPatientProfile | null | undefined,
): ScoreTrialResult {
  const p = study.protocolSection;
  const criteria = parseEligibilityCriteria(p.eligibilityModule?.eligibilityCriteria);
  const exclusionCriteriaPresent = criteria.exclusion.length > 0;

  if (!patientProfile) {
    return {
      score: 0,
      cat: getMatchCategory(0),
      criteria,
      inclusionMap: {},
      exclusionMap: {},
      hardGatePassed: false,
      isOrganMismatch: false,
      isBreastOvarianMismatch: false,
      exclusionCriteriaPresent,
    };
  }

  const inclusionMap = autoMatchInclusion(criteria.inclusion, patientProfile);
  const exclusionMap = autoMatchExclusion(criteria.exclusion, patientProfile);

  const isOrganMismatch = computeOrganMismatch(p, patientProfile);
  const isBreastOvarianMismatch = computeBreastOvarianMismatch(p, patientProfile);

  // An empty exclusion list can never fail this gate — .some() on [] is false,
  // so trials with zero explicit ClinicalTrials.gov exclusion rules are never penalized.
  const hasActiveExclusion = criteria.exclusion.some((_, i) => exclusionMap[i] === true);
  const hardGatePassed = !isOrganMismatch && !isBreastOvarianMismatch && !hasActiveExclusion;

  const score = hardGatePassed
    ? computeInclusionScore(criteria.inclusion, inclusionMap, patientProfile)
    : 0;

  const cat =
    isOrganMismatch || isBreastOvarianMismatch
      ? ORGAN_MISMATCH_CATEGORY
      : !hardGatePassed
        ? UNMET_INCLUSION_CATEGORY
        : getMatchCategory(score);

  return {
    score,
    cat,
    criteria,
    inclusionMap,
    exclusionMap,
    hardGatePassed,
    isOrganMismatch,
    isBreastOvarianMismatch,
    exclusionCriteriaPresent,
  };
}
