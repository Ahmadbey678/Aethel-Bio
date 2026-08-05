/**
 * Shared domain types used across App.tsx, TrialMatchSimulator.tsx, and the
 * scoring/cohort-registry modules. Single source of truth so the shape of a
 * "study" or "patient profile" can't drift between files.
 */

export interface EligibilityModule {
  eligibilityCriteria?: string;
  sex?: string;
  minimumAge?: string;
  maximumAge?: string;
  healthyVolunteers?: boolean;
  stdAges?: string[];
}

export interface StudyProtocol {
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
    contactsLocationsModule?: {
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
    eligibilityModule?: EligibilityModule;
  };
}

/** Matches the structured-output schema of the extract-patient Edge Function (supabase/functions/extract-patient/schema.ts). */
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
  pik3ca: string;
  tp53: string;
  tmb: string | null;
  priorTreatments: string[];
}

export interface PatientProfile {
  biomarker: string;
  condition: string;
  extractedParams: ExtractedParams;
}

export interface TrialCardData {
  nctId: string;
  briefTitle: string;
  phase: string;
  leadSponsor: string;
  primaryLocation: string;
  overallStatus: string;
  conditions?: string[];
}

export interface QueryHistoryEntry {
  id: string;
  biomarker: string;
  condition: string;
  stage: string | null;
  timestamp: string;
  resultCount: number;
}

export interface PathologyHistoryEntry {
  id: string;
  fileName: string;
  timestamp: string;
  success: boolean;
  biomarker?: string;
  disease?: string;
}
