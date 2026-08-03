import { useState, useCallback, useEffect, useRef } from "react";
import { Search, Dna, FlaskConical, ArrowRight, AlertCircle, Sparkles, Upload, FileText, RotateCcw, Loader2 } from "lucide-react";
import TrialMatchSimulator from "./TrialMatchSimulator";
import { extractFileText } from "./extractReport";

// Supabase project URL — Edge Function endpoint
const SUPABASE_URL = "https://cioaszuvlpzbraavdlri.supabase.co";

/* ── Types ─────────────────────────────────────────── */

interface StudyProtocol {
  protocolSection: {
    identificationModule: {
      nctId: string;
      briefTitle: string;
      officialTitle?: string;
    };
    statusModule: {
      overallStatus: string;
      lastKnownStatus?: string;
    };
    sponsorCollaboratorsModule: {
      leadSponsor: { name: string; class?: string };
      collaborators?: { name: string; class: string }[];
    };
    designModule: {
      phases?: string[];
      enrollmentInfo?: { count?: number; type?: string };
    };
    contactsLocationsModule: {
      locations?: {
        facility?: string;
        city?: string;
        state?: string;
        country?: string;
        status?: string;
      }[];
      centralContacts?: { name?: string; role?: string }[];
    };
    conditionsModule?: {
      conditions?: string[];
    };
    eligibilityModule?: {
      eligibilityCriteria?: string;
      sex?: string;
      minimumAge?: string;
      maximumAge?: string;
      healthyVolunteers?: boolean;
      stdAges?: string[];
    };
  };
}

interface StudiesResponse {
  studies: StudyProtocol[];
  nextPageToken?: string;
  totalCount?: number;
}

interface TrialCardData {
  nctId: string;
  briefTitle: string;
  phase: string;
  leadSponsor: string;
  primaryLocation: string;
  overallStatus: string;
  conditions?: string[];
}

export interface ExtractedParams {
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

export interface PatientProfile {
  biomarker: string;
  condition: string;
  extractedParams: ExtractedParams;
}

/* ── Preset Patient Data ──────────────────────────────── */
// NOTE: PRESET_PATIENT was previously defined here as a legacy demo value.
// It is no longer used — the AI extraction pipeline populates patient data.

/* ── Quick biomarker lookups ────────────────────────── */

const QUICK_LOOKUPS = [
  { biomarker: "BRCA1 Mutation", condition: "Triple-Negative Breast Cancer" },
  { biomarker: "PIK3CA H1047R", condition: "Breast Cancer" },
  { biomarker: "EGFR T790M", condition: "Non-Small Cell Lung Cancer" },
  { biomarker: "KRAS G12C", condition: "Colorectal Cancer" },
];

/* ── Helpers ─────────────────────────────────────────── */

interface SanitizedTerms {
  cleanGene: string;
  cleanDisease: string;
}

/**
 * Extract a clean gene symbol and simplify the disease string
 * for optimal ClinicalTrials.gov API queries.
 *
 * Gene examples:
 *   "BRCA1 c.5266dupC (p.Gln1756Profs*74)"       → "BRCA1"
 *   "KRAS G12C mutation"                           → "KRAS"
 *   "EGFR T790M"                                   → "EGFR"
 *
 * Disease examples:
 *   "Invasive Breast Carcinoma, Ductal Type"       → "Breast Cancer"
 *   "Metastatic Triple-Negative Breast Cancer"     → "Breast Cancer"
 *   "Non-Small Cell Lung Cancer"                   → "Non-Small Cell Lung Cancer" (preserved)
 *   "Colorectal Carcinoma"                         → "Colorectal Cancer"
 */
function sanitizeSearchTerms(disease: string, mutation: string): SanitizedTerms {
  // ── Gene extraction ──
  // Match the leading gene symbol (letters + optional digits/hyphen suffix)
  let cleanGene = mutation.trim();
  const geneMatch = cleanGene.match(/^([A-Za-z][A-Za-z0-9]{0,9}(?:-[A-Za-z0-9]+)?)(?:\s|$)/);
  if (geneMatch) {
    cleanGene = geneMatch[1].toUpperCase();
  }

  // ── Disease simplification ──
  let cleanDisease = disease.trim();

  if (cleanDisease) {
    // 1. Replace "Carcinoma" → "Cancer" unless already "Cancer"
    cleanDisease = cleanDisease.replace(/\bCarcinoma\b/gi, "Cancer");

    // 2. Strip leading modifiers that are too granular for trial search
    //    e.g. "Invasive Breast Cancer" → "Breast Cancer"
    //         "Metastatic Triple-Negative Breast Cancer" → "Breast Cancer"
    //    but keep well-known subtypes like "Non-Small Cell Lung Cancer",
    //    "Triple-Negative Breast Cancer", "Acute Myeloid Leukemia"
    const knownSubtypes = [
      /\bnon-?small\s+cell\s+/i,
      /\bsmall\s+cell\s+/i,
      /\btriple-?negative\s+/i,
      /\bHer2[+]?\s+(positive\s+)?/i,
      /\bHR[+]?\s+(positive\s+)?/i,
      /\bacute\s+(myeloid|lymphocytic|lymphoblastic)\s+/i,
      /\bchronic\s+(myeloid|lymphocytic|lymphoblastic)\s+/i,
    ];

    const hasKnownSubtype = knownSubtypes.some((re) => re.test(cleanDisease));
    if (!hasKnownSubtype) {
      // Strip leading adjectives like "Invasive", "Metastatic", "Advanced",
      // "Recurrent", "Refractory", "Locally Advanced", "Unresectable"
      cleanDisease = cleanDisease
        .replace(
          /^(Metastatic|Invasive|Advanced|Recurrent|Refractory|Locally\s+Advanced|Unresectable)\s+/i,
          "",
        )
        .trim();
    }

    // 3. Remove trailing detail after a comma or parenthesis
    //    e.g. "Breast Cancer, Ductal Type" → "Breast Cancer"
    cleanDisease = cleanDisease.replace(/[,\(].*$/, "").trim();
  }

  return { cleanGene, cleanDisease };
}

/**
 * Check whether AI-extracted data contains meaningful biomarker/condition
 * values that indicate a genuine pathology or NGS report was processed.
 */
function isValidReport(data: PatientProfile): boolean {
  return !!(data.biomarker?.trim() || data.condition?.trim());
}

function normalizePhase(phases?: string[]): string {
  if (!phases || phases.length === 0) return "N/A";
  return phases
    .map((p) => p.replace("PHASE", "Phase "))
    .join("/");
}

function formatLocation(loc?: {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
}): string {
  if (!loc) return "Location not specified";
  const parts = [loc.facility, loc.city, loc.state, loc.country].filter(Boolean);
  return parts.join(", ") || "Location not specified";
}

function mapStudyToCard(study: StudyProtocol): TrialCardData {
  const p = study.protocolSection;
  const location = p.contactsLocationsModule?.locations?.[0];
  return {
    nctId: p.identificationModule.nctId,
    briefTitle: p.identificationModule.briefTitle,
    phase: normalizePhase(p.designModule?.phases),
    leadSponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name || "Unknown",
    primaryLocation: formatLocation(location),
    overallStatus: p.statusModule.overallStatus,
    conditions: p.conditionsModule?.conditions,
  };
}

/* ── Sub-components ──────────────────────────────────── */

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle backdrop-blur-xl bg-surface/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-muted">
            <Dna className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight text-text-primary">
              Aethel Bio
            </h1>
            <p className="hidden text-xs text-text-muted sm:block">
              AI-Powered Biomarker Clinical Trial Matching Workspace
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span className="hidden sm:inline">ClinicalTrials.gov</span>
        </div>
      </div>
    </header>
  );
}

function EmptyHero() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center sm:py-32">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-muted">
        <FlaskConical className="h-8 w-8 text-primary" />
      </div>
      <h2 className="font-heading text-2xl font-semibold text-text-primary sm:text-3xl">
        Search Recruiting Clinical Trials
      </h2>
      <p className="mt-3 max-w-lg text-base text-text-secondary">
        Find actively recruiting oncology trials by genetic biomarker or disease
        condition. Enter search terms below or use one of the quick lookup buttons
        to get started.
      </p>
      <div className="mt-8 flex items-center gap-2 rounded-lg bg-surface-raised px-4 py-2.5 text-sm text-text-muted">
        <Search className="h-4 w-4" />
        <span>Enter a biomarker or condition above to begin</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-shimmer rounded-xl border border-border-subtle bg-surface-raised p-5">
      <div className="mb-3 h-3 w-28 rounded bg-surface-hover" />
      <div className="mb-4 h-4 w-full rounded bg-surface-hover" />
      <div className="mb-4 h-4 w-3/4 rounded bg-surface-hover" />
      <div className="mb-2 flex gap-2">
        <div className="h-5 w-20 rounded-full bg-surface-hover" />
        <div className="h-5 w-24 rounded-full bg-surface-hover" />
      </div>
      <div className="mb-1 h-3 w-40 rounded bg-surface-hover" />
      <div className="h-3 w-48 rounded bg-surface-hover" />
    </div>
  );
}

function TrialCard({
  trial,
  index,
  onSelect,
}: {
  trial: TrialCardData;
  index: number;
  onSelect: (nctId: string) => void;
}) {
  return (
    <article
      className="animate-fade-in-up group relative rounded-xl border border-border-subtle bg-surface-raised p-5 shadow-card transition-all duration-200 ease-out hover:border-border-default hover:shadow-card-hover hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs font-medium text-primary">
          {trial.nctId}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-muted px-2.5 py-0.5 text-xs font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {trial.overallStatus}
        </span>
      </div>

      <h3 className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-text-primary">
        {trial.briefTitle}
      </h3>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border-subtle bg-surface px-2.5 py-0.5 text-xs font-medium text-text-secondary">
          {trial.phase}
        </span>
        {trial.conditions && trial.conditions.length > 0 && (
          <span className="text-xs text-text-muted line-clamp-1">
            {trial.conditions.slice(0, 2).join(", ")}
            {trial.conditions.length > 2 && " …"}
          </span>
        )}
      </div>

      <div className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary">
        <svg className="h-3.5 w-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
        {trial.leadSponsor}
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-xs text-text-muted">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        {trial.primaryLocation}
      </div>

      <button
        onClick={() => onSelect(trial.nctId)}
        className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-primary-muted px-4 py-2.5 text-sm font-medium text-primary transition-all duration-150 ease-out hover:bg-primary hover:text-white active:scale-[0.98] cursor-pointer"
      >
        Select Trial to Analyze
        <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
      </button>
    </article>
  );
}

/* ── Main App ────────────────────────────────────────── */

export default function App() {
  const [biomarker, setBiomarker] = useState("");
  const [condition, setCondition] = useState("");
  const [trials, setTrials] = useState<TrialCardData[]>([]);
  const [fullStudies, setFullStudies] = useState<StudyProtocol[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<StudyProtocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [isValidMedicalDoc, setIsValidMedicalDoc] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSampleClick = useCallback((bio: string, cond: string) => {
    setBiomarker(bio);
    setCondition(cond);
    setTimeout(() => fetchTrials(bio, cond), 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTrials = useCallback(async (bio: string, cond: string) => {
    if (!bio.trim() && !cond.trim()) {
      setError("Please enter a biomarker or condition to search.");
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);

    // Sanitize raw terms into clean gene symbol and simplified disease name
    const { cleanGene, cleanDisease } = sanitizeSearchTerms(cond, bio);

    // Build the query strategy stack — try each in order until one returns results
    const queries: { params: URLSearchParams; label: string }[] = [];

    const baseParams = () => {
      const p = new URLSearchParams();
      p.set("filter.overallStatus", "RECRUITING");
      p.set("pageSize", "9");
      p.set("format", "json");
      return p;
    };

    // Level 1 — Primary: query.cond + query.term (both available)
    if (cleanDisease && cleanGene) {
      const p = baseParams();
      p.set("query.cond", cleanDisease);
      p.set("query.term", cleanGene);
      queries.push({ params: p, label: "primary" });
    }

    // Level 2 — Secondary: single combined term (both available)
    if (cleanDisease && cleanGene) {
      const p = baseParams();
      p.set("query.term", `${cleanGene} ${cleanDisease}`);
      queries.push({ params: p, label: "secondary" });
    }

    // Level 3 — Broad: condition only (if disease available)
    if (cleanDisease) {
      const p = baseParams();
      p.set("query.cond", cleanDisease);
      queries.push({ params: p, label: "broad" });
    }

    // Gene-only fallback (if only gene was entered, no disease)
    if (cleanGene && !cleanDisease) {
      const p = baseParams();
      p.set("query.term", cleanGene);
      queries.push({ params: p, label: "gene-only" });
    }

    try {
      for (const q of queries) {
        const url = `https://clinicaltrials.gov/api/v2/studies?${q.params.toString()}`;
        // eslint-disable-next-line no-console
        console.debug(`[Trial Search] ${q.label}:`, url);

        const res = await fetch(url);
        if (!res.ok) continue; // Network-level failure → skip to next strategy

        const data: StudiesResponse = await res.json();
        if (data.studies && data.studies.length > 0) {
          const mapped = data.studies.map(mapStudyToCard);
          setFullStudies(data.studies);
          setTrials(mapped);
          setLoading(false);
          return; // ✓ Results found — done
        }
      }

      // All query strategies returned zero results
      setTrials([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch trials.";
      setError(message);
      setTrials([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    fetchTrials(biomarker, condition);
  }, [biomarker, condition, fetchTrials]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  const handleSelectTrial = useCallback((nctId: string) => {
    const study = fullStudies.find((s) => s.protocolSection.identificationModule.nctId === nctId);
    if (study) {
      setSelectedStudy(study);
    }
  }, [fullStudies]);

  /* ── File upload handler ── */
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-uploaded
    e.target.value = "";

    // File size check — reject files > 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Maximum size is 10MB.");
      return;
    }

    setUploadedFileName(file.name);
    setError(null);
    setExtracting(true);

    try {
      // Extract text from the uploaded file
      const extractedText = await extractFileText(file);

      // Check extracted text length
      if (extractedText.trim().length < 20) {
        setError("Could not extract readable text from this file. Try a different format.");
        setExtracting(false);
        return;
      }

      // Send text to the Edge Function
      const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extractedText }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "AI analysis failed");
      }

      const { data } = result;

      // Validate that the extraction produced meaningful biomarker/disease data
      if (!isValidReport(data)) {
        setIsValidMedicalDoc(false);
        setError("⚠️ Invalid Document: Uploaded file is not a recognized Pathology or NGS report.");
        setPatientProfile(null);
        setBiomarker("");
        setCondition("");
        return;
      }

      setIsValidMedicalDoc(true);

      // Set the patient profile with AI-extracted data
      setPatientProfile(data);
      setBiomarker(data.biomarker ?? "");
      setCondition(data.condition ?? "");

      // Auto-search trials with the extracted biomarker and condition
      setTimeout(() => fetchTrials(data.biomarker ?? "", data.condition ?? ""), 0);
    } catch (err) {
      setError("AI analysis failed. Please try again or enter data manually.");
    } finally {
      setExtracting(false);
    }
  }, [fetchTrials]);

  /* ── Reset workspace ── */
  const handleReset = useCallback(() => {
    setBiomarker("");
    setCondition("");
    setPatientProfile(null);
    setUploadedFileName(null);
    setIsValidMedicalDoc(null);
    setTrials([]);
    setFullStudies([]);
    setSelectedStudy(null);
    setError(null);
    setSearched(false);
  }, []);

  /* ── Close simulator on Escape ── */
  useEffect(() => {
    if (!selectedStudy) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedStudy(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedStudy]);

  return (
    <div className="min-h-screen bg-aethel-glow">
      <Header />

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ── Search Zone ── */}
        <section className="border-b border-border-subtle pb-8 pt-8 sm:pt-12">
          <div className="mx-auto max-w-2xl">
            {/* Biomarker */}
            <div className="mb-4">
              <label htmlFor="biomarker" className="mb-1.5 block text-sm font-medium text-text-secondary">
                Biomarker / Mutation
              </label>
              <div className="relative">
                <Dna className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="biomarker"
                  type="text"
                  placeholder='e.g., "BRCA1", "EGFR T790M", "KRAS G12C"'
                  value={biomarker}
                  onChange={(e) => setBiomarker(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded-xl border border-border-subtle bg-surface-raised py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Condition */}
            <div className="mb-5">
              <label htmlFor="condition" className="mb-1.5 block text-sm font-medium text-text-secondary">
                Disease / Condition
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  id="condition"
                  type="text"
                  placeholder='e.g., "Triple-Negative Breast Cancer", "Lung Cancer"'
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded-xl border border-border-subtle bg-surface-raised py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Quick biomarker lookups */}
            <div className="mb-5">
              <p className="mb-2 text-xs font-medium text-text-muted">
                Common Biomarkers
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_LOOKUPS.map((s) => (
                  <button
                    key={s.biomarker}
                    onClick={() => handleSampleClick(s.biomarker, s.condition)}
                    className="rounded-lg border border-border-subtle bg-surface-raised px-3.5 py-2 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary active:scale-[0.97] cursor-pointer"
                  >
                    {s.biomarker}
                  </button>
                ))}
              </div>
            </div>

            {/* ── PDF Upload / Preset Section ── */}
            <div className="mb-5 rounded-xl border border-accent/25 bg-accent-muted/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-accent">
                <FileText className="h-4 w-4" />
                <span>Patient Record & Pathology Processing</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="Upload pathology or NGS report"
                />

                {/* Upload button — single primary upload action */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={extracting}
                  className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-4 py-2.5 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-accent/40 hover:bg-accent-muted/20 hover:text-accent active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {extracting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {extracting ? "Analyzing report…" : "Upload Pathology / NGS Report (.pdf, .txt, .docx)"}
                </button>
              </div>

              {/* Uploaded file indicator — only for actual file uploads */}
              {uploadedFileName && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-raised px-3.5 py-2 text-xs text-text-secondary">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span className="flex-1 truncate">{uploadedFileName}</span>
                  {extracting ? (
                    <span className="flex items-center gap-1.5 text-text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Analyzing…
                    </span>
                  ) : patientProfile ? (
                    <span className="text-accent font-medium">
                      ✓ Extracted
                    </span>
                  ) : isValidMedicalDoc === false ? (
                    <span className="text-destructive font-medium">
                      ❌ Invalid Report
                    </span>
                  ) : null}
                </div>
              )}

              </div>

            {/* ── Search row: Search + Reset buttons ── */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Search Clinical Trials
                </>
              )}
            </button>

            <button
              onClick={handleReset}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-destructive/40 hover:bg-destructive-muted/20 hover:text-destructive active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Reset Workspace</span>
            </button>
          </div>
          </div>
        </section>

        {/* ── Error ── */}
        {error && (
          <div className="mx-auto mt-6 flex max-w-2xl items-center gap-3 rounded-xl bg-destructive-muted px-5 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-xs font-medium underline-offset-2 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Results Section ── */}
        <section className="mt-8">
          {/* Loading skeletons */}
          {loading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Results grid */}
          {!loading && trials.length > 0 && (
            <>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold text-text-primary">
                  Recruiting Trials
                </h2>
                <span className="text-xs text-text-muted">
                  {trials.length} result{trials.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {trials.map((trial, i) => (
                  <TrialCard
                    key={trial.nctId}
                    trial={trial}
                    index={i}
                    onSelect={handleSelectTrial}
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty state (no results but searched) */}
          {!loading && searched && trials.length === 0 && !error && (
            <div className="mt-12 flex flex-col items-center justify-center px-4 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
                <Search className="h-6 w-6 text-text-muted" />
              </div>
              <h3 className="font-heading text-lg font-medium text-text-primary">
                No recruiting trials found
              </h3>
              <p className="mt-2 max-w-md text-sm text-text-secondary">
                Try broadening your search terms, using a different biomarker, or
                checking the condition name.
              </p>
            </div>
          )}

          {/* Initial hero / empty state */}
          {!searched && !loading && (
            <EmptyHero />
          )}
        </section>
      </main>

      {/* ── Trial Match Simulator Drawer ── */}
      {selectedStudy && (
        <TrialMatchSimulator
          study={selectedStudy}
          patientProfile={patientProfile ?? undefined}
          onClose={() => setSelectedStudy(null)}
        />
      )}
    </div>
  );
}