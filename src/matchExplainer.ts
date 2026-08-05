/**
 * Explainability Layer
 * Generates human-readable explanations for why a trial matched.
 */

export interface MatchExplanation {
  fieldMatches: FieldMatch[];
  summary: string;
}

export interface FieldMatch {
  field: "title" | "condition" | "criteria" | "biomarker";
  text: string;
  snippet: string;
}

/**
 * Generate a match explanation showing which fields matched the search terms.
 */
export function explainMatch(
  trialTitle: string,
  trialConditions: string[],
  eligibilityText: string | undefined,
  biomarker: string,
  condition: string,
): MatchExplanation {
  const fieldMatches: FieldMatch[] = [];
  const bioLower = biomarker.toLowerCase().trim();
  const condLower = condition.toLowerCase().trim();

  // Helper to get a short snippet around the match
  const getSnippet = (text: string, term: string, maxLen = 80): string => {
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text.slice(0, maxLen);
    const start = Math.max(0, idx - 20);
    const end = Math.min(text.length, idx + term.length + 40);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < text.length) snippet = snippet + "…";
    return snippet;
  };

  // 1. Title match
  if (bioLower.length > 2 && trialTitle.toLowerCase().includes(bioLower)) {
    fieldMatches.push({
      field: "title",
      text: "Title contains biomarker term",
      snippet: getSnippet(trialTitle, bioLower),
    });
  }
  if (condLower.length > 2) {
    // Check if any word from condition matches title
    const condWords = condLower.split(/\s+/).filter((w: string) => w.length > 3);
    for (const word of condWords) {
      if (trialTitle.toLowerCase().includes(word)) {
        fieldMatches.push({
          field: "title",
          text: `Title contains disease term "${word}"`,
          snippet: getSnippet(trialTitle, word),
        });
        break;
      }
    }
  }

  // 2. Condition field match
  if (trialConditions && trialConditions.length > 0) {
    const conditionsJoined = trialConditions.join(" ");
    if (bioLower.length > 2 && conditionsJoined.toLowerCase().includes(bioLower)) {
      fieldMatches.push({
        field: "condition",
        text: "Conditions list contains biomarker term",
        snippet: getSnippet(conditionsJoined, bioLower),
      });
    }
    if (condLower.length > 2) {
      const condWords = condLower.split(/\s+/).filter((w: string) => w.length > 3);
      for (const word of condWords) {
        if (conditionsJoined.toLowerCase().includes(word)) {
          fieldMatches.push({
            field: "condition",
            text: `Conditions list matches "${word}"`,
            snippet: getSnippet(conditionsJoined, word),
          });
          break;
        }
      }
    }
  }

  // 3. Eligibility criteria match
  if (eligibilityText) {
    if (bioLower.length > 2 && eligibilityText.toLowerCase().includes(bioLower)) {
      fieldMatches.push({
        field: "criteria",
        text: "Eligibility criteria mention the biomarker",
        snippet: getSnippet(eligibilityText, bioLower),
      });
    }
    if (condLower.length > 2) {
      const condWords = condLower.split(/\s+/).filter((w: string) => w.length > 3);
      for (const word of condWords) {
        if (eligibilityText.toLowerCase().includes(word)) {
          fieldMatches.push({
            field: "criteria",
            text: `Criteria mention disease term "${word}"`,
            snippet: getSnippet(eligibilityText, word),
          });
          break;
        }
      }
    }
  }

  // 4. Biomarker field (always present if biomarker was provided)
  if (biomarker.trim()) {
    fieldMatches.push({
      field: "biomarker",
      text: `Searched by biomarker: ${biomarker}`,
      snippet: "",
    });
  }

  // Build summary
  const uniqueFields = new Set(fieldMatches.map((f) => f.field));
  let summary: string;
  if (fieldMatches.length === 0) {
    summary = `Matched by broad disease category: ${condition}`;
  } else {
    const fieldNames = Array.from(uniqueFields)
      .map((f) => f === "biomarker" ? "biomarker term" : `${f} field`)
      .join(", ");
    summary = `Matched via ${fieldNames}`;
  }

  return { fieldMatches, summary };
}

/**
 * Generate explainability for a patient profile match.
 */
export function explainProfileMatch(
  score: number,
  inclusionSatisfied: number,
  inclusionTotal: number,
  exclusionCleared: number,
  exclusionTotal: number,
  details: { text: string; met: boolean; reason: string; type: string }[],
): string {
  const metCriteria = details.filter((d) => d.met && d.type === "inclusion");
  const unmetCriteria = details.filter((d) => !d.met && d.type === "inclusion");
  const conflictCriteria = details.filter((d) => !d.met && d.type === "exclusion");

  const parts: string[] = [];

  // Score explanation
  parts.push(
    `${Math.round(score)}% match — ${inclusionSatisfied}/${inclusionTotal} inclusion criteria satisfied, ${exclusionCleared}/${exclusionTotal} exclusion criteria cleared.`
  );

  // Specific satisfied criteria
  if (metCriteria.length > 0) {
    const topMet = metCriteria.slice(0, 3);
    parts.push(`Satisfied: ${topMet.map((c) => c.reason).join("; ")}`);
    if (metCriteria.length > 3) {
      parts.push(`…and ${metCriteria.length - 3} more`);
    }
  }

  // Conflicts
  if (unmetCriteria.length > 0 || conflictCriteria.length > 0) {
    const conflicts = [...unmetCriteria, ...conflictCriteria].slice(0, 3);
    parts.push(`Potential conflicts: ${conflicts.map((c) => c.reason).join("; ")}`);
    if (unmetCriteria.length + conflictCriteria.length > 3) {
      parts.push(`…and ${unmetCriteria.length + conflictCriteria.length - 3} more`);
    }
  }

  return parts.join(" | ");
}