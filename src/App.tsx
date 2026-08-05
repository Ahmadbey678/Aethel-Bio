import { useState, useCallback, useEffect } from "react";
import { Loader2, Menu, Sparkles } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import TrialMatchSimulator from "./TrialMatchSimulator";
import { extractFileText } from "./extractReport";
import { scoreTrial } from "./trialScoring";
import { logUnmatchedCohort, UNMATCHED_MATCH_THRESHOLD } from "./cohortRegistry";
import { supabase, onAuthStateChange } from "./utils/supabaseClient";
import AuthModal from "./components/AuthModal";
import LockScreen from "./components/LockScreen";
import Sidebar, { VIEW_TITLES, type ViewKey } from "./components/Sidebar";
import HomeView from "./views/HomeView";
import MatchesView from "./views/MatchesView";
import QueriesView from "./views/QueriesView";
import PathologyView from "./views/PathologyView";
import UnmatchedRegistryView from "./views/UnmatchedRegistryView";
import SettingsView from "./views/SettingsView";
import type {
  StudyProtocol,
  PatientProfile,
  TrialCardData,
  QueryHistoryEntry,
  PathologyHistoryEntry,
} from "./types";

// Supabase project URL — Edge Function endpoint (separate from the
// VITE_SUPABASE_* client used for the Unmatched Registry table).
const SUPABASE_URL = "https://cioaszuvlpzbraavdlri.supabase.co";

interface StudiesResponse {
  studies: StudyProtocol[];
  nextPageToken?: string;
  totalCount?: number;
}

/* ── Helpers ─────────────────────────────────────────── */

interface CleanTerms {
  biomarker: string;
  disease: string;
}

/**
 * Simple string normaliser. Extracts the primary gene symbol
 * and maps the disease to a clean search term.
 */
function getCleanTerms(biomarker: string, condition: string): CleanTerms {
  let cleanBio = biomarker.trim();
  const knownGenes = ["BRCA1", "PIK3CA", "EGFR", "KRAS", "TP53", "ALK", "ROS1", "BRAF", "HER2"];
  const found = knownGenes.find((g) => cleanBio.toUpperCase().includes(g));
  if (found) {
    cleanBio = found;
  } else {
    cleanBio = cleanBio.split(/\s+/)[0] || "";
  }

  let cleanDisease = condition.trim();
  if (/\bbreast\b/i.test(cleanDisease)) cleanDisease = "Breast Cancer";
  else if (/\blung\b/i.test(cleanDisease)) cleanDisease = "Lung Cancer";
  else if (/\bprostate\b/i.test(cleanDisease)) cleanDisease = "Prostate Cancer";
  else if (/\bcolorect/i.test(cleanDisease)) cleanDisease = "Colorectal Cancer";
  else if (/\bpancrea/i.test(cleanDisease)) cleanDisease = "Pancreatic Cancer";
  else if (/\bovarian?/i.test(cleanDisease)) cleanDisease = "Ovarian Cancer";
  else if (/\bendometri/i.test(cleanDisease)) cleanDisease = "Endometrial Cancer";
  else if (/\bliver\b|hepatocellular/i.test(cleanDisease)) cleanDisease = "Liver Cancer";
  else if (/\bgastric\b|stomach\b/i.test(cleanDisease)) cleanDisease = "Gastric Cancer";
  else if (/\bhead\s+and\s+neck/i.test(cleanDisease)) cleanDisease = "Head and Neck Cancer";
  else if (/\bmelanoma/i.test(cleanDisease)) cleanDisease = "Melanoma";
  else if (/\bglioblastoma|glioma/i.test(cleanDisease)) cleanDisease = "Glioblastoma";
  else if (/\bbladder\b/i.test(cleanDisease)) cleanDisease = "Bladder Cancer";
  else if (/\brenal\b/i.test(cleanDisease)) cleanDisease = "Renal Cancer";
  else if (cleanDisease) cleanDisease = "Solid Tumor";

  return { biomarker: cleanBio, disease: cleanDisease };
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
  return phases.map((p) => p.replace("PHASE", "Phase ")).join("/");
}

function formatLocation(loc?: {
  facility?: string;
  city?: string;
  state?: string;
  country?: string;
}): string {
  if (!loc) return "Location not specified";
  const parts: string[] = [];
  if (loc.city) parts.push(loc.city);
  if (loc.state) parts.push(loc.state);
  else if (loc.country) parts.push(loc.country);
  return parts.length > 0 ? `Primary Site: ${parts.join(", ")}` : "Location not specified";
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

/* ── Main App ────────────────────────────────────────── */

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [biomarker, setBiomarker] = useState("");
  const [condition, setCondition] = useState("");
  const [stage, setStage] = useState<string | null>(null);
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

  const [queryHistory, setQueryHistory] = useState<QueryHistoryEntry[]>([]);
  const [pathologyHistory, setPathologyHistory] = useState<PathologyHistoryEntry[]>([]);

  const fetchTrials = useCallback(
    async (bio: string, cond: string, stageArg: string | null) => {
      if (!bio.trim() && !cond.trim()) {
        setError("Please upload a patient report or enter pathology details before searching for trial matches.");
        return;
      }
      setLoading(true);
      setError(null);
      setSearched(true);
      setActiveView("matches");

      const { biomarker: cleanBio, disease: cleanCond } = getCleanTerms(bio, cond);

      try {
        const isTNBCBRCA1 =
          cleanCond.toLowerCase().includes("triple") &&
          cleanCond.toLowerCase().includes("breast") &&
          (cleanBio === "BRCA1" || cleanCond.toLowerCase().includes("brca1"));

        let condParam = cleanCond;
        if (isTNBCBRCA1) {
          condParam = `"Triple-Negative Breast Cancer" OR "Breast Cancer"`;
        }

        // Tier 1 — disease + gene (most specific)
        let url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(condParam)}&query.term=${encodeURIComponent(cleanBio)}&filter.overallStatus=RECRUITING&pageSize=15`;
        let res = await fetch(url);
        let data: StudiesResponse = await res.json();
        let studies = data.studies || [];

        // Tier 2 — disease only (fallback when Tier 1 returns 0)
        if (studies.length === 0 && cleanCond) {
          url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(cleanCond)}&filter.overallStatus=RECRUITING&pageSize=15`;
          res = await fetch(url);
          data = await res.json();
          studies = data.studies || [];
        }

        // Tier 3 — gene only (fallback when Tier 2 returns 0)
        if (studies.length === 0 && cleanBio) {
          url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(cleanBio)}&filter.overallStatus=RECRUITING&pageSize=15`;
          res = await fetch(url);
          data = await res.json();
          studies = data.studies || [];
        }

        const limitedStudies = studies.slice(0, 15);
        setFullStudies(limitedStudies);
        setTrials(limitedStudies.map(mapStudyToCard));

        setQueryHistory((prev) =>
          [
            {
              id: crypto.randomUUID(),
              biomarker: bio,
              condition: cond,
              stage: stageArg,
              timestamp: new Date().toISOString(),
              resultCount: limitedStudies.length,
            },
            ...prev,
          ].slice(0, 50),
        );

        // Unmatched Patient Cohort Registry — only meaningful when we have a
        // real patient profile with lab metrics to log (i.e. a report was
        // uploaded, not a plain manual biomarker/condition search).
        if (patientProfile) {
          const bestScore =
            limitedStudies.length > 0
              ? Math.max(...limitedStudies.map((s) => scoreTrial(s, patientProfile).score))
              : 0;
          if (bestScore < UNMATCHED_MATCH_THRESHOLD) {
            void logUnmatchedCohort({
              disease: patientProfile.extractedParams.disease,
              biomarker: patientProfile.extractedParams.mutation,
              stage: stageArg,
              labMetrics: {
                egfr: patientProfile.extractedParams.egfr,
                platelets: patientProfile.extractedParams.platelets,
                noBrainMets: patientProfile.extractedParams.noBrainMets,
              },
              bestMatchScore: bestScore,
              trialsConsidered: limitedStudies.length,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch trials.";
        setError(message);
        setTrials([]);
      } finally {
        setLoading(false);
      }
    },
    [patientProfile],
  );

  const handleSampleClick = useCallback(
    (bio: string, cond: string) => {
      setBiomarker(bio);
      setCondition(cond);
      setTimeout(() => fetchTrials(bio, cond, stage), 0);
    },
    [fetchTrials, stage],
  );

  const handleSearch = useCallback(() => {
    fetchTrials(biomarker, condition, stage);
  }, [biomarker, condition, stage, fetchTrials]);

  const handleRerunQuery = useCallback(
    (entry: QueryHistoryEntry) => {
      setBiomarker(entry.biomarker);
      setCondition(entry.condition);
      setStage(entry.stage);
      setTimeout(() => fetchTrials(entry.biomarker, entry.condition, entry.stage), 0);
    },
    [fetchTrials],
  );

  const handleSelectTrial = useCallback(
    (nctId: string) => {
      const study = fullStudies.find((s) => s.protocolSection.identificationModule.nctId === nctId);
      if (study) setSelectedStudy(study);
    },
    [fullStudies],
  );

  const handleToggleStage = useCallback((s: string) => {
    setStage((prev) => (prev === s ? null : s));
  }, []);

  /* ── File upload / extraction handler (drag-drop and click-to-browse both call this) ── */
  const handleFileSelected = useCallback(
    async (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        setError("File too large. Maximum size is 10MB.");
        return;
      }

      setUploadedFileName(file.name);
      setError(null);
      setExtracting(true);
      const historyId = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      try {
        const extractedText = await extractFileText(file);

        if (extractedText.trim().length < 20) {
          setError("Could not extract readable text from this file. Try a different format.");
          setPathologyHistory((prev) => [{ id: historyId, fileName: file.name, timestamp, success: false }, ...prev].slice(0, 50));
          return;
        }

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

        if (!isValidReport(data)) {
          setIsValidMedicalDoc(false);
          setError("⚠️ Invalid Document: Uploaded file is not a recognized Pathology or NGS report.");
          setPatientProfile(null);
          setBiomarker("");
          setCondition("");
          setPathologyHistory((prev) => [{ id: historyId, fileName: file.name, timestamp, success: false }, ...prev].slice(0, 50));
          return;
        }

        setIsValidMedicalDoc(true);
        setPatientProfile(data);
        setBiomarker(data.biomarker ?? "");
        setCondition(data.condition ?? "");
        setPathologyHistory((prev) =>
          [
            { id: historyId, fileName: file.name, timestamp, success: true, biomarker: data.biomarker, disease: data.condition },
            ...prev,
          ].slice(0, 50),
        );

        setTimeout(() => fetchTrials(data.biomarker ?? "", data.condition ?? "", stage), 0);
      } catch {
        setError("AI analysis failed. Please try again or enter data manually.");
        setPathologyHistory((prev) => [{ id: historyId, fileName: file.name, timestamp, success: false }, ...prev].slice(0, 50));
      } finally {
        setExtracting(false);
      }
    },
    [fetchTrials, stage],
  );

  /* ── Reset workspace (keeps session history intact) ── */
  const handleReset = useCallback(() => {
    setBiomarker("");
    setCondition("");
    setStage(null);
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

  /* ── App-wide auth gate ────────────────────────────────────────────────
     Resolve the session once on mount (the cached session is replayed
     synchronously by `onAuthStateChange`), then keep the whole workspace in
     sync with sign-in / sign-out from anywhere (e.g. the AuthModal). When the
     session goes null (sign-out, expiry), the workspace is replaced by the
     LockScreen. */
  useEffect(() => {
    if (!supabase) {
      /* Dev mode without Supabase: skip the gate so the demo stays usable. */
      setSessionChecked(true);
      return;
    }

    let active = true;
    const client = supabase;

    const resolve = async () => {
      try {
        const {
          data: { session: initial },
        } = await client.auth.getSession();
        if (!active) return;
        setSession(initial);
        setSessionChecked(true);
      } catch (err) {
        console.error("Supabase Auth Error:", err);
        if (!active) return;
        setSession(null);
        setSessionChecked(true);
      }
    };
    void resolve();

    const unsubscribe = onAuthStateChange((next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        /* Signed out — reset the workspace so the next user starts clean. */
        setActiveView("home");
        setMobileNavOpen(false);
        setBiomarker("");
        setCondition("");
        setStage(null);
        setPatientProfile(null);
        setUploadedFileName(null);
        setIsValidMedicalDoc(null);
        setTrials([]);
        setFullStudies([]);
        setSelectedStudy(null);
        setError(null);
        setSearched(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /* ── Sign out ───────────────────────────────────────────────────────── */
  const handleSignOut = useCallback(async () => {
    if (!supabase) {
      /* Dev mode without Supabase — nothing to sign out of. */
      setSessionChecked(true);
      setSession(null);
      return;
    }
    setSignOutPending(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError("We couldn't sign you out. Please try again.");
        console.error("Sign out error:", error.message);
        return;
      }
      /* `onAuthStateChange` flips the session to null → LockScreen. */
    } catch {
      setSignOutError("We couldn't sign you out. Please try again.");
    } finally {
      setSignOutPending(false);
    }
  }, []);

  const workspace = (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        active={activeView}
        onNavigate={setActiveView}
        matchCount={trials.length}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        userEmail={session?.user?.email}
        signOutPending={signOutPending}
        signOutError={signOutError}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle bg-surface/80 px-4 py-3.5 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary lg:hidden cursor-pointer"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="font-heading text-base font-semibold text-text-primary">{VIEW_TITLES[activeView]}</h1>
          </div>
          <div className="hidden items-center gap-2 text-xs text-text-muted sm:flex">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            ClinicalTrials.gov
          </div>
        </header>

        {/* ── Active view ── */}
        <main className="flex-1 overflow-y-auto">
          {activeView === "home" && (
            <HomeView
              biomarker={biomarker}
              onBiomarkerChange={setBiomarker}
              condition={condition}
              onConditionChange={setCondition}
              stage={stage}
              onToggleStage={handleToggleStage}
              patientProfile={patientProfile}
              uploadedFileName={uploadedFileName}
              extracting={extracting}
              isValidMedicalDoc={isValidMedicalDoc}
              onSampleClick={handleSampleClick}
              onFileSelected={handleFileSelected}
              onSearch={handleSearch}
              onReset={handleReset}
              loading={loading}
              error={error}
              onDismissError={() => setError(null)}
            />
          )}
          {activeView === "matches" && (
            <MatchesView
              loading={loading}
              trials={trials}
              searched={searched}
              error={error}
              onDismissError={() => setError(null)}
              onSelectTrial={handleSelectTrial}
            />
          )}
          {activeView === "queries" && <QueriesView history={queryHistory} onRerun={handleRerunQuery} />}
          {activeView === "pathology" && <PathologyView history={pathologyHistory} />}
          {activeView === "unmatched" && <UnmatchedRegistryView />}
          {activeView === "settings" && <SettingsView />}
        </main>
      </div>

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

  /* ── Session gate ──────────────────────────────────────────────────────
     While the session is being resolved, show a brief loader. When signed
     out (or Supabase unconfigured → dev mode), show the LockScreen so the
     user can sign back in. The AuthModal mounts unconditionally so it can
     always be opened. */
  if (!sessionChecked) {
    return (
      <>
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => {
            setSessionChecked(true);
          }}
        />
        <div className="flex h-screen items-center justify-center bg-surface">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
        />
        <LockScreen onSignIn={() => setIsAuthModalOpen(true)} />
      </>
    );
  }

  return (
    <>
      {workspace}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </>
  );
}
