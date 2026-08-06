import { useEffect, useRef, useState } from "react";
import {
  Dna,
  Search,
  FileText,
  Upload,
  Loader2,
  RotateCcw,
  UploadCloud,
  FlaskConical,
  Beaker,
  AlertTriangle,
  X,
  Check,
  Activity,
  Zap,
} from "lucide-react";
import type { PatientProfile } from "../types";

const QUICK_LOOKUPS = [
  { biomarker: "BRCA1 Mutation", condition: "Triple-Negative Breast Cancer" },
  { biomarker: "PIK3CA H1047R", condition: "Breast Cancer" },
  { biomarker: "EGFR T790M", condition: "Non-Small Cell Lung Cancer" },
  { biomarker: "KRAS G12C", condition: "Colorectal Cancer" },
];

const STAGE_OPTIONS = ["Stage I", "Stage II", "Stage III", "Stage IV"];

/* One-click demo case loaders — fill Disease, Biomarker, and Stage at once. */
const PRESET_CASES = [
  { label: "Stage IV NSCLC + EGFR T790M", biomarker: "EGFR T790M", condition: "Non-Small Cell Lung Cancer", stage: "Stage IV" },
  { label: "Metastatic Colorectal + KRAS G12D", biomarker: "KRAS G12D", condition: "Colorectal Cancer", stage: "Stage IV" },
  { label: "Triple-Negative Breast + BRCA1", biomarker: "BRCA1", condition: "Triple-Negative Breast Cancer", stage: "Stage III" },
  { label: "Prostate Adenocarcinoma + PTEN Loss", biomarker: "PTEN Loss", condition: "Prostate Cancer", stage: "Stage II" },
];

const FILE_TYPE_BADGES = [".pdf", ".docx", ".txt"];

/* Staged progress shown while the AI extraction pipeline is running. */
const EXTRACTION_STEPS = [
  { label: "Reading report text", Icon: FileText },
  { label: "Extracting biomarkers", Icon: Dna },
  { label: "Normalizing lab values", Icon: Beaker },
  { label: "Preparing trial match", Icon: Search },
];

/* Workspace status footer rows. */
const STATUS_ITEMS = [
  { label: "ClinicalTrials.gov API", value: "Online", Icon: Activity, dotClass: "bg-success" },
  { label: "AI Pathology Parser", value: "Ready", Icon: FileText, dotClass: "bg-success" },
  { label: "Scoring Engine", value: "Multi-Tier Fallback Active", Icon: Zap, dotClass: "bg-accent" },
];

export default function HomeView({
  biomarker,
  onBiomarkerChange,
  condition,
  onConditionChange,
  stage,
  onToggleStage,
  patientProfile,
  uploadedFileName,
  extracting,
  isValidMedicalDoc,
  onSampleClick,
  onPresetSelect,
  onFileSelected,
  onSearch,
  onReset,
  loading,
  error,
  onDismissError,
}: {
  biomarker: string;
  onBiomarkerChange: (v: string) => void;
  condition: string;
  onConditionChange: (v: string) => void;
  stage: string | null;
  onToggleStage: (s: string) => void;
  patientProfile: PatientProfile | null;
  uploadedFileName: string | null;
  extracting: boolean;
  isValidMedicalDoc: boolean | null;
  onSampleClick: (bio: string, cond: string) => void;
  onPresetSelect: (bio: string, cond: string, presetStage: string) => void;
  onFileSelected: (file: File) => void;
  onSearch: () => void;
  onReset: () => void;
  loading: boolean;
  error: string | null;
  onDismissError: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [extractStep, setExtractStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Advance the staged extraction stepper while a report is being analyzed. */
  useEffect(() => {
    if (!extracting) return;
    setExtractStep(0);
    const t = setInterval(() => {
      setExtractStep((s) => Math.min(s + 1, EXTRACTION_STEPS.length - 1));
    }, 850);
    return () => clearInterval(t);
  }, [extracting]);

  /* Pills of the values revealed after a successful extraction. */
  const extractedPills = patientProfile
    ? [
        { label: "Mutation", value: patientProfile.extractedParams.mutation || "N/A" },
        { label: "Disease", value: patientProfile.extractedParams.disease || "N/A" },
        {
          label: "eGFR",
          value: patientProfile.extractedParams.egfr !== null ? `${patientProfile.extractedParams.egfr} mL/min` : "N/A",
        },
        {
          label: "Platelets",
          value: patientProfile.extractedParams.platelets !== null ? `${patientProfile.extractedParams.platelets} K/µL` : "N/A",
        },
      ]
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSearch();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left Column: Precision Query Builder ── */}
        <section className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-text-primary">
            <Dna className="h-4 w-4 text-primary" />
            Precision Query Builder
          </h2>

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
                onChange={(e) => {
                  onBiomarkerChange(e.target.value);
                  if (error) onDismissError();
                }}
                onKeyDown={handleKeyDown}
                className="w-full rounded-xl border border-border-subtle bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="condition" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Disease / Indication
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                id="condition"
                type="text"
                placeholder='e.g., "Triple-Negative Breast Cancer", "Lung Cancer"'
                value={condition}
                onChange={(e) => {
                  onConditionChange(e.target.value);
                  if (error) onDismissError();
                }}
                onKeyDown={handleKeyDown}
                className="w-full rounded-xl border border-border-subtle bg-surface py-3 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted/60 transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-text-muted">Stage</p>
            <div className="flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggleStage(s)}
                  aria-pressed={stage === s}
                  className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer ${
                    stage === s
                      ? "border-primary bg-primary text-white"
                      : "border-border-subtle bg-surface text-text-secondary hover:border-primary/40 hover:bg-primary-muted hover:text-primary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-1">
            <p className="mb-2 text-xs font-medium text-text-muted">Common Biomarkers</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_LOOKUPS.map((s) => (
                <button
                  key={s.biomarker}
                  onClick={() => onSampleClick(s.biomarker, s.condition)}
                  className="rounded-lg border border-border-subtle bg-surface px-3.5 py-2 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary active:scale-[0.97] cursor-pointer"
                >
                  {s.biomarker}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-border-subtle pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-text-muted">
              <Zap className="h-3.5 w-3.5 text-accent" />
              Preset Clinical Cases
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_CASES.map((preset) => {
                const active =
                  biomarker === preset.biomarker && condition === preset.condition && stage === preset.stage;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onPresetSelect(preset.biomarker, preset.condition, preset.stage)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-all duration-150 active:scale-[0.97] cursor-pointer ${
                      active
                        ? "border-accent/60 bg-accent-muted/20 text-accent"
                        : "border-border-subtle bg-surface text-text-secondary hover:border-accent/40 hover:bg-accent-muted/10 hover:text-accent"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {patientProfile && (
            <div className="mt-5 rounded-xl border border-accent/25 bg-accent-muted/10 p-4">
              <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-accent">
                <FlaskConical className="h-3.5 w-3.5" />
                Saved Patient Profile
              </h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <span className="text-text-muted">Mutation</span>
                  <p className="truncate font-medium text-text-primary">{patientProfile.extractedParams.mutation}</p>
                </div>
                <div>
                  <span className="text-text-muted">Disease</span>
                  <p className="truncate font-medium text-text-primary">{patientProfile.extractedParams.disease}</p>
                </div>
                <div>
                  <span className="text-text-muted">eGFR</span>
                  <p className="font-medium text-text-primary">
                    {patientProfile.extractedParams.egfr !== null ? `${patientProfile.extractedParams.egfr} mL/min` : "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-text-muted">Platelets</span>
                  <p className="font-medium text-text-primary">
                    {patientProfile.extractedParams.platelets !== null ? `${patientProfile.extractedParams.platelets} K/µL` : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Right Column: Report Processing ── */}
        <section className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-base font-semibold text-text-primary">
            <FileText className="h-4 w-4 text-accent" />
            Report Processing
          </h2>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.doc"
            className="hidden"
            aria-label="Upload pathology or NGS report"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFileSelected(file);
            }}
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onFileSelected(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all duration-150 ${
              isDragging
                ? "border-accent bg-accent-muted/20"
                : "border-border-subtle bg-surface hover:border-accent/40 hover:bg-accent-muted/5"
            }`}
          >
            {extracting ? (
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            ) : (
              <UploadCloud className={`h-8 w-8 ${isDragging ? "text-accent" : "text-text-muted"}`} />
            )}
            <div>
              <p className="text-sm font-medium text-text-primary">
                {extracting ? "Analyzing report…" : "Drag & drop a pathology / NGS report"}
              </p>
              <p className="mt-1 text-xs text-text-muted">or click to browse</p>
            </div>
            <div className="flex items-center gap-1.5" aria-label="Supported file formats">
              {FILE_TYPE_BADGES.map((ext) => (
                <span
                  key={ext}
                  className="rounded-md border border-border-subtle bg-surface-raised px-2 py-0.5 font-mono text-[11px] font-medium text-text-secondary"
                >
                  {ext}
                </span>
              ))}
            </div>
            {!extracting && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-secondary">
                <Upload className="h-3.5 w-3.5" />
                Browse Files
              </span>
            )}
            {extracting && (
              <div className="mt-1 flex flex-col items-center gap-1.5" role="status" aria-live="polite">
                {EXTRACTION_STEPS.map((step, i) => {
                  const Icon = step.Icon;
                  const isCurrent = i === extractStep;
                  const isDone = i < extractStep;
                  return (
                    <div
                      key={step.label}
                      className={`flex items-center gap-2 text-xs transition-all duration-300 ${
                        isCurrent
                          ? "font-medium text-accent"
                          : isDone
                            ? "text-success"
                            : "text-text-muted/60"
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-3.5 w-3.5 animate-check-pop" />
                      ) : isCurrent ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                      {step.label}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {uploadedFileName && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-xs text-text-secondary">
              <FileText className="h-3.5 w-3.5 text-accent" />
              <span className="flex-1 truncate">{uploadedFileName}</span>
              {extracting ? (
                <span className="flex items-center gap-1.5 text-text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing…
                </span>
              ) : patientProfile ? (
                <span className="font-medium text-accent">✓ Extracted</span>
              ) : isValidMedicalDoc === false ? (
                <span className="font-medium text-destructive">❌ Invalid Report</span>
              ) : null}
            </div>
          )}

          {!extracting && patientProfile && (
            <div className="mt-3 animate-fade-in-up rounded-xl border border-success/25 bg-success-muted/10 p-3.5">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-success">
                <Check className="h-3.5 w-3.5" />
                Biomarkers extracted from report
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {extractedPills.map((pill) => (
                  <span
                    key={pill.label}
                    className="inline-flex items-center gap-1.5 rounded-md border border-success/20 bg-surface px-2.5 py-1 text-[11px] text-text-secondary"
                  >
                    <span className="text-text-muted">{pill.label}:</span>
                    <span className="font-medium text-text-primary">{pill.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-surface px-3.5 py-2.5 text-xs text-text-muted">
            <Beaker className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
            AI extraction reads mutation, disease, and key lab values (eGFR, platelets, brain metastases status)
            directly from the uploaded report to auto-populate eligibility matching.
          </div>
        </section>
      </div>

      {/* ── Inline error banner (e.g. empty search) ── */}
      {error && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive-muted px-4 py-3 text-sm text-destructive animate-fade-in-up"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1 leading-snug">{error}</p>
          <button
            onClick={onDismissError}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-destructive/70 transition-colors duration-150 hover:bg-destructive/15 hover:text-destructive cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Bottom Action Bar ── */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSearch}
          disabled={loading}
          className="flex flex-1 items-center justify-center gap-2.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-glow transition-all duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
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
          onClick={onReset}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-text-secondary transition-all duration-150 hover:border-destructive/40 hover:bg-destructive-muted/20 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          <span className="hidden sm:inline">Reset Workspace</span>
        </button>
      </div>

      {/* ── Workspace Status Bar ── */}
      <footer className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border-subtle bg-footer px-4 py-3">
        {STATUS_ITEMS.map((item) => {
          const Icon = item.Icon;
          return (
            <span key={item.label} className="inline-flex items-center gap-2 text-xs">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${item.dotClass}`}
                />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${item.dotClass}`} />
              </span>
              <Icon className="h-3.5 w-3.5 text-text-muted" />
              <span className="text-text-muted">{item.label}:</span>
              <span className="font-medium text-text-primary">{item.value}</span>
            </span>
          );
        })}
      </footer>
    </div>
  );
}