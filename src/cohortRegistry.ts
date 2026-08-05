/**
 * Unmatched Patient Registry — "Orphan Cohort Engine".
 *
 * When a search's best-scoring trial falls below the match threshold, the
 * (de-identified) patient record is logged to the `unmatched_patients`
 * Supabase table so demand for a disease/biomarker combination with no active
 * recruiting trial can be tracked.
 *
 * Security: `unmatched_patients` is protected by Row Level Security. Every
 * operation requires an authenticated session whose JWT `app_metadata` role is
 * `admin`. Non-admin sessions are denied by the database itself (HTTP 403 /
 * RLS violation) — the client never bypasses that check.
 */

import { supabase, isPermissionDenied } from "./utils/supabaseClient";

export const UNMATCHED_MATCH_THRESHOLD = 40;

export interface UnmatchedCohortInput {
  disease: string;
  biomarker: string;
  stage?: string | null;
  labMetrics: {
    egfr: number | null;
    platelets: number | null;
    noBrainMets: boolean;
  };
  bestMatchScore: number;
  trialsConsidered: number;
}

/** Row shape of `unmatched_patients` as returned by Supabase. */
export interface UnmatchedPatientRow {
  id: string;
  biomarker: string;
  disease: string;
  stage: string | null;
  lab_metrics: {
    egfr?: number | null;
    platelets?: number | null;
    noBrainMets?: boolean;
  } | null;
  best_match_score: number | null;
  trials_considered: number | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Insert one anonymized patient record into `unmatched_patients`. No-ops (with
 * a console warning) if Supabase isn't configured — never throws, so a logging
 * failure can't break the search flow itself.
 *
 * Only admin sessions pass the INSERT policy; for everyone else the insert is
 * rejected by RLS and logged as a warning (expected behaviour).
 */
export async function logUnmatchedCohort(input: UnmatchedCohortInput): Promise<void> {
  if (!supabase) {
    console.warn("Supabase not configured — skipping unmatched patient log.", input);
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user ?? null;

  const { error } = await supabase.from("unmatched_patients").insert({
    biomarker: input.biomarker,
    disease: input.disease,
    stage: input.stage ?? null,
    lab_metrics: input.labMetrics,
    best_match_score: input.bestMatchScore,
    trials_considered: input.trialsConsidered,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  });

  if (error) {
    if (isPermissionDenied(error)) {
      console.warn(
        "Unmatched patient log skipped — INSERT requires an admin session (RLS denied this request).",
        error.message,
      );
    } else {
      console.error("Failed to log unmatched patient:", error.message);
    }
  }
}
