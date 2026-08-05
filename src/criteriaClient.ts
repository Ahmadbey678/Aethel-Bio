/**
 * Client wrapper for the parse-criteria Edge Function.
 * Caches parsed results per NCT ID to avoid re-parsing the same trial.
 */

import type { StudyProtocol } from "./types";

const SUPABASE_URL = "https://cioaszuvlpzbraavdlri.supabase.co";

export interface ParsedCriteria {
  inclusion: string[];
  exclusion: string[];
}

// Cache parsed criteria per NCT ID
const criteriaCache = new Map<string, ParsedCriteria>();

// In-flight requests dedup
const inflightRequests = new Map<string, Promise<ParsedCriteria>>();

/**
 * Fetch and parse eligibility criteria for a study using the LLM Edge Function.
 * Falls back to the client-side parser if the Edge Function is unavailable.
 */
export async function parseStudyCriteria(study: StudyProtocol): Promise<ParsedCriteria> {
  const nctId = study.protocolSection.identificationModule.nctId;

  // Check cache first
  if (criteriaCache.has(nctId)) {
    return criteriaCache.get(nctId)!;
  }

  // Check if there's already an in-flight request
  if (inflightRequests.has(nctId)) {
    return inflightRequests.get(nctId)!;
  }

  const rawText = study.protocolSection.eligibilityModule?.eligibilityCriteria;

  if (!rawText || rawText.trim().length === 0) {
    const empty: ParsedCriteria = { inclusion: [], exclusion: [] };
    criteriaCache.set(nctId, empty);
    return empty;
  }

  // Try the LLM-based Edge Function
  const request = (async (): Promise<ParsedCriteria> => {
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText, nctId }),
      });

      if (!response.ok) {
        throw new Error(`Edge function returned ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Parsing failed");
      }

      const parsed: ParsedCriteria = {
        inclusion: result.data.inclusion || [],
        exclusion: result.data.exclusion || [],
      };

      criteriaCache.set(nctId, parsed);
      return parsed;
    } catch (err) {
      console.warn(`LLM criteria parsing failed for ${nctId}, falling back to client-side parser:`, err);
      // Fallback to client-side parser
      const fallback = clientSideParse(rawText);
      criteriaCache.set(nctId, fallback);
      return fallback;
    } finally {
      inflightRequests.delete(nctId);
    }
  })();

  inflightRequests.set(nctId, request);
  return request;
}

/**
 * Client-side eligibility text parser (fallback).
 * Used when the LLM Edge Function is unavailable.
 */
function clientSideParse(text: string): ParsedCriteria {
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
        return true;
      });

  return {
    inclusion: extractItems(inclusionPart),
    exclusion: extractItems(exclusionPart),
  };
}

/**
 * Pre-parse criteria for a batch of studies (for the search results listing).
 * Fetches full record for each study first.
 */
export async function batchParseCriteria(studies: StudyProtocol[]): Promise<Map<string, ParsedCriteria>> {
  const map = new Map<string, ParsedCriteria>();
  await Promise.all(
    studies.map(async (study) => {
      const nctId = study.protocolSection.identificationModule.nctId;
      try {
        const parsed = await parseStudyCriteria(study);
        map.set(nctId, parsed);
      } catch {
        map.set(nctId, { inclusion: [], exclusion: [] });
      }
    })
  );
  return map;
}

/**
 * Check if criteria are cached for a given NCT ID.
 */
export function hasParsedCriteria(nctId: string): boolean {
  return criteriaCache.has(nctId);
}

/**
 * Get cached criteria without making a request.
 */
export function getCachedCriteria(nctId: string): ParsedCriteria | undefined {
  return criteriaCache.get(nctId);
}

/**
 * Clear the criteria cache (e.g. when resetting workspace).
 */
export function clearCriteriaCache(): void {
  criteriaCache.clear();
  inflightRequests.clear();
}