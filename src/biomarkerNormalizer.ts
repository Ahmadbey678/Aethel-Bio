/**
 * Biomarker Normalization Layer
 *
 * Maps protein-level, cDNA-level, and common-name variant strings to a
 * canonical identifier. Also handles Urdu/transliterated Urdu terms.
 *
 * If a raw query returns zero results, call normalizeSynonymRetry(biomarker)
 * to get alternate search strings and retry.
 */

/* ── Canonical variant lookup table ────────────────── */
// Maps many forms to a single canonical search term
type VariantEntry = {
  canonical: string;
  aliases: string[];
  gene: string;
};

const VARIANT_LOOKUP: VariantEntry[] = [
  // EGFR
  { canonical: "EGFR T790M", gene: "EGFR", aliases: ["EGFR p.T790M", "EGFR c.2369C>T", "EGFR T790M mutation", "T790M", "EGFR exon 20 T790M"] },
  { canonical: "EGFR exon 19 deletion", gene: "EGFR", aliases: ["EGFR ex19del", "EGFR E746_A750del", "EGFR del19", "EGFR exon 19 del", "EGFR 19del"] },
  { canonical: "EGFR L858R", gene: "EGFR", aliases: ["EGFR p.L858R", "EGFR c.2573T>G", "EGFR L858R mutation", "L858R"] },
  { canonical: "EGFR G719X", gene: "EGFR", aliases: ["EGFR p.G719X", "EGFR G719S", "EGFR G719C", "EGFR G719A"] },
  { canonical: "EGFR S768I", gene: "EGFR", aliases: ["EGFR p.S768I", "EGFR c.2303G>T"] },
  { canonical: "EGFR V769M", gene: "EGFR", aliases: ["EGFR p.V769M", "EGFR c.2305G>A"] },
  { canonical: "EGFR C797S", gene: "EGFR", aliases: ["EGFR p.C797S", "EGFR c.2390G>C", "EGFR C797S mutation"] },
  { canonical: "EGFR exon 20 insertion", gene: "EGFR", aliases: ["EGFR ex20ins", "EGFR exon 20 ins", "EGFR 20ins", "EGFR exon 20 mutation"] },
  // KRAS
  { canonical: "KRAS G12C", gene: "KRAS", aliases: ["KRAS p.G12C", "KRAS c.34G>T", "KRAS G12C mutation", "G12C", "K-RAS G12C"] },
  { canonical: "KRAS G12D", gene: "KRAS", aliases: ["KRAS p.G12D", "KRAS c.35G>A", "G12D", "K-RAS G12D"] },
  { canonical: "KRAS G12V", gene: "KRAS", aliases: ["KRAS p.G12V", "KRAS c.35G>T", "G12V", "K-RAS G12V"] },
  { canonical: "KRAS G13D", gene: "KRAS", aliases: ["KRAS p.G13D", "KRAS c.38G>A", "G13D", "K-RAS G13D"] },
  { canonical: "KRAS A146T", gene: "KRAS", aliases: ["KRAS p.A146T", "KRAS c.436G>A", "A146T"] },
  { canonical: "KRAS Q61H", gene: "KRAS", aliases: ["KRAS p.Q61H", "KRAS c.183A>C", "Q61H"] },
  // BRAF
  { canonical: "BRAF V600E", gene: "BRAF", aliases: ["BRAF p.V600E", "BRAF c.1799T>A", "V600E", "B-RAF V600E"] },
  { canonical: "BRAF V600K", gene: "BRAF", aliases: ["BRAF p.V600K", "BRAF c.1798_1799del", "V600K"] },
  // BRCA1
  { canonical: "BRCA1 mutation", gene: "BRCA1", aliases: ["BRCA1", "BRCA1 alteration", "BRCA1 pathogenic variant", "BRCA1 gene mutation"] },
  { canonical: "BRCA2 mutation", gene: "BRCA2", aliases: ["BRCA2", "BRCA2 alteration", "BRCA2 pathogenic variant", "BRCA2 gene mutation"] },
  // PIK3CA
  { canonical: "PIK3CA H1047R", gene: "PIK3CA", aliases: ["PIK3CA p.H1047R", "PIK3CA c.3140A>G", "H1047R", "PIK3CA H1047R mutation"] },
  { canonical: "PIK3CA E545K", gene: "PIK3CA", aliases: ["PIK3CA p.E545K", "PIK3CA c.1633G>A", "E545K"] },
  { canonical: "PIK3CA E542K", gene: "PIK3CA", aliases: ["PIK3CA p.E542K", "PIK3CA c.1624G>A", "E542K"] },
  // ALK
  { canonical: "ALK rearrangement", gene: "ALK", aliases: ["ALK fusion", "ALK translocation", "ALK positive", "ALK rearranged", "EML4-ALK"] },
  { canonical: "ALK L1196M", gene: "ALK", aliases: ["ALK p.L1196M", "ALK c.3586C>A"] },
  // ROS1
  { canonical: "ROS1 rearrangement", gene: "ROS1", aliases: ["ROS1 fusion", "ROS1 translocation", "ROS1 positive", "ROS1 rearranged"] },
  // HER2 / ERBB2
  { canonical: "HER2 amplification", gene: "ERBB2", aliases: ["HER2 positive", "ERBB2 amplification", "HER2/neu amplification", "HER2 overexpression", "HER2 amplified"] },
  // NTRK
  { canonical: "NTRK fusion", gene: "NTRK", aliases: ["NTRK1 fusion", "NTRK2 fusion", "NTRK3 fusion", "TRK fusion", "pan-TRK positive"] },
  // IDH
  { canonical: "IDH1 R132H", gene: "IDH1", aliases: ["IDH1 p.R132H", "IDH1 c.395G>A", "IDH1 mutation", "IDH1 R132"] },
  { canonical: "IDH2 R172K", gene: "IDH2", aliases: ["IDH2 p.R172K", "IDH2 c.515G>A", "IDH2 mutation"] },
  // TP53
  { canonical: "TP53 R175H", gene: "TP53", aliases: ["TP53 p.R175H", "TP53 c.524G>A", "p53 R175H"] },
  { canonical: "TP53 Y220C", gene: "TP53", aliases: ["TP53 p.Y220C", "TP53 c.659A>G", "p53 Y220C"] },
];

/* ── Urdu / transliterated Urdu biomarker terms ────── */
const URDU_BIOMARKER_MAP: Record<string, string> = {
  "ای جی ایف آر": "EGFR",
  "بریکا 1": "BRCA1",
  "بریکا 2": "BRCA2",
  "کے آر اے ایس": "KRAS",
  "بی آر اے ایف": "BRAF",
  "پائیک 3 سی اے": "PIK3CA",
  "اے ایل کے": "ALK",
  "ہر 2": "HER2",
  "ٹی پی 53": "TP53",
  "آئی ڈی ایچ 1": "IDH1",
  "آئی ڈی ایچ 2": "IDH2",
  "این ٹی آر کے": "NTRK",
  "ٹی۷۹۰ایم": "T790M",
  "جی۱۲سی": "G12C",
  "وی۶۰۰ای": "V600E",
  "ایچ۱۰۴۷آر": "H1047R",
  // Transliterated Urdu
  "egfr mutation": "EGFR",
  "kras mutation": "KRAS",
  "braf mutation": "BRAF",
  "brca mutation": "BRCA1",
  "alk fusion": "ALK rearrangement",
  "her2 positive": "HER2 amplification",
  "pik3ca mutation": "PIK3CA",
};

/* ── Public API ────────────────────────────────────── */

/**
 * Normalize a biomarker input string to its canonical form.
 * Returns { canonical, gene, found } or { canonical: original, gene: null, found: false }.
 */
export function normalizeBiomarker(input: string): {
  canonical: string;
  gene: string | null;
  found: boolean;
  matchedAlias: string | null;
} {
  const trimmed = input.trim();

  // 1. Check Urdu map
  const urduNormalized = URDU_BIOMARKER_MAP[trimmed.toLowerCase()];
  const searchText = urduNormalized || trimmed;

  // 2. Direct lookup by canonical (case-insensitive)
  const directMatch = VARIANT_LOOKUP.find(
    (e) => e.canonical.toLowerCase() === searchText.toLowerCase()
  );
  if (directMatch) {
    return { canonical: directMatch.canonical, gene: directMatch.gene, found: true, matchedAlias: null };
  }

  // 3. Check aliases
  for (const entry of VARIANT_LOOKUP) {
    const aliasMatch = entry.aliases.find(
      (a) => a.toLowerCase() === searchText.toLowerCase()
    );
    if (aliasMatch) {
      return { canonical: entry.canonical, gene: entry.gene, found: true, matchedAlias: aliasMatch };
    }
  }

  // 4. Partial match — check if the input contains any alias or gene name
  const inputUpper = trimmed.toUpperCase();
  for (const entry of VARIANT_LOOKUP) {
    if (inputUpper.includes(entry.gene.toUpperCase())) {
      return { canonical: entry.canonical, gene: entry.gene, found: true, matchedAlias: null };
    }
  }

  // 5. Gene-only lookup
  const knownGenes = ["BRCA1", "BRCA2", "EGFR", "KRAS", "BRAF", "PIK3CA", "ALK", "ROS1", "ERBB2", "HER2", "NTRK", "IDH1", "IDH2", "TP53", "NRAS", "HRAS", "MET", "RET", "FGFR", "PTEN", "AKT1", "CDK4", "CDK6", "AR", "ESR1", "FLT3"];
  const matchedGene = knownGenes.find((g) => inputUpper.includes(g));
  if (matchedGene) {
    return { canonical: trimmed, gene: matchedGene, found: false, matchedAlias: null };
  }

  return { canonical: trimmed, gene: null, found: false, matchedAlias: null };
}

/**
 * Generate synonym search terms to retry when the raw query returns zero results.
 * Returns a list of alternative search strings plus the canonical form.
 */
export function getNormalizedSynonyms(input: string): string[] {
  const { canonical, gene, found } = normalizeBiomarker(input);
  if (!found || canonical === input.trim()) return [];

  // If the canonical is already the input, return just the gene as a broader fallback
  if (gene && canonical.toLowerCase() !== input.trim().toLowerCase()) {
    const synonyms = [canonical];
    if (gene !== canonical.split(/\s+/)[0]) {
      synonyms.push(gene);
    }
    return [...new Set(synonyms)];
  }

  return [canonical];
}

/**
 * Check if text contains Urdu script characters.
 */
export function containsUrdu(text: string): boolean {
  const urduUnicodeRange = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return urduUnicodeRange.test(text);
}

/**
 * Normalize Urdu biomarker input to English gene name.
 * Returns the English gene name or the original text if no Urdu mapping found.
 */
export function normalizeUrduBiomarker(input: string): string {
  const cleaned = input.trim();

  // Check exact Urdu matches
  const urduMatch = URDU_BIOMARKER_MAP[cleaned];
  if (urduMatch) return urduMatch;

  // Check partial Urdu matches (search within mixed text)
  for (const [urdu, english] of Object.entries(URDU_BIOMARKER_MAP)) {
    if (cleaned.includes(urdu)) return english;
  }

  return cleaned;
}

export { VARIANT_LOOKUP };