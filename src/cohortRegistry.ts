/**
 * Unmatched Patient Cohort Registry — "Orphan Cohort Engine".
 *
 * When a search's best-scoring trial falls below the match threshold, the
 * (de-identified) patient record is logged to the `unmatched_cohorts`
 * Supabase table so demand for a disease/biomarker combination with no
 * active recruiting trial can be tracked and aggregated.
 */

import { supabase } from "./utils/supabaseClient";

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

interface UnmatchedCohortRow {
  id: string;
  disease: string;
  biomarker: string;
  stage: string | null;
  lab_metrics: Record<string, unknown> | null;
  best_match_score: number | null;
  trials_considered: number | null;
  created_at: string;
}

export interface AggregatedCohort {
  key: string;
  disease: string;
  biomarker: string;
  patientCount: number;
  avgBestScore: number;
  stages: string[];
  lastSeen: string;
}

/**
 * Insert one anonymized patient record into `unmatched_cohorts`. No-ops (with
 * a console warning) if Supabase isn't configured — never throws, so a
 * logging failure can't break the search flow itself.
 */
export async function logUnmatchedCohort(input: UnmatchedCohortInput): Promise<void> {
  if (!supabase) {
    console.warn("Supabase not configured — skipping unmatched cohort log.", input);
    return;
  }
  const { error } = await supabase.from("unmatched_cohorts").insert({
    disease: input.disease,
    biomarker: input.biomarker,
    stage: input.stage ?? null,
    lab_metrics: input.labMetrics,
    best_match_score: input.bestMatchScore,
    trials_considered: input.trialsConsidered,
  });
  if (error) {
    console.error("Failed to log unmatched cohort:", error.message);
  }
}

/**
 * Fetch every logged record and aggregate client-side by disease+biomarker
 * into cohort-demand cards, sorted by patient count (highest demand first).
 */
export async function fetchUnmatchedCohorts(): Promise<AggregatedCohort[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("unmatched_cohorts")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<UnmatchedCohortRow[]>();

  if (error) {
    console.error("Failed to fetch unmatched cohorts:", error.message);
    throw new Error(
      error.code === "PGRST205" || error.message.includes("Could not find the table")
        ? "The unmatched_cohorts table doesn't exist yet — run the setup SQL in the Supabase SQL Editor."
        : `Failed to load the Unmatched Registry: ${error.message}`,
    );
  }

  const groups = new Map<string, UnmatchedCohortRow[]>();
  for (const row of data ?? []) {
    const key = `${row.disease.trim().toLowerCase()}|${row.biomarker.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const aggregated: AggregatedCohort[] = Array.from(groups.entries()).map(([key, rows]) => {
    const scores = rows.map((r) => r.best_match_score ?? 0);
    const avgBestScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const stages = Array.from(new Set(rows.map((r) => r.stage).filter((s): s is string => !!s)));
    return {
      key,
      disease: rows[0].disease,
      biomarker: rows[0].biomarker,
      patientCount: rows.length,
      avgBestScore,
      stages,
      lastSeen: rows[0].created_at,
    };
  });

  return aggregated.sort((a, b) => b.patientCount - a.patientCount);
}
