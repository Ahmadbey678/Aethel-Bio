/**
 * Shared match-score display primitives for the unmatched registry.
 *
 * Scores are stored as decimal fractions (0–1); `asPercent` also guards
 * against any legacy 0–100 values. Tone thresholds:
 *   red < 25% · amber 25–49% · green ≥ 50%
 */

export type ScoreTone = "destructive" | "warning" | "success";

export const SCORE_TONE_STYLES: Record<ScoreTone, { bar: string; text: string }> = {
  destructive: { bar: "bg-destructive", text: "text-destructive" },
  warning: { bar: "bg-warning", text: "text-warning" },
  success: { bar: "bg-success", text: "text-success" },
};

/** Stored scores are decimal fractions (0–1); guard against legacy 0–100 values. */
export function asPercent(value: number | null): number | null {
  if (value === null || Number.isNaN(value)) return null;
  return value > 1 ? value : value * 100;
}

/** Clamp a match score to a 0–100 percentage for progress-bar widths. */
export function clampPct(value: number | null): number {
  const pct = asPercent(value);
  if (pct === null) return 0;
  return Math.min(100, Math.max(0, pct));
}

export function formatScore(value: number | null): string {
  const pct = asPercent(value);
  return pct === null ? "—" : `${Math.round(pct)}%`;
}

export function scoreTone(pct: number): ScoreTone {
  if (pct < 25) return "destructive";
  if (pct < 50) return "warning";
  return "success";
}

/** Compact color-coded progress bar for a match score. */
export function ScoreBar({
  value,
  className = "h-1.5 w-16",
}: {
  value: number | null;
  className?: string;
}) {
  const pct = clampPct(value);
  const tone = scoreTone(pct);
  return (
    <span
      role="img"
      aria-label={`${formatScore(value)} trial fit`}
      className={`inline-block overflow-hidden rounded-full bg-surface-hover ${className}`}
    >
      <span
        className={`block h-full rounded-full ${SCORE_TONE_STYLES[tone].bar} transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

const SCORE_BADGE_STYLES: Record<ScoreTone, string> = {
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
};

/** High-contrast color-coded badge for a match score (red / amber / green). */
export function ScoreBadge({ value, className = "" }: { value: number | null; className?: string }) {
  const pct = asPercent(value);
  if (pct === null) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-border-subtle bg-surface-hover px-2 py-0.5 text-xs font-semibold text-text-muted ${className}`}
      >
        —
      </span>
    );
  }
  const tone = scoreTone(pct);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${SCORE_BADGE_STYLES[tone]} ${className}`}
    >
      {Math.round(pct)}%
    </span>
  );
}
