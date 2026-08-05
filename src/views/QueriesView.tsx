import { Search, Dna, RotateCcw } from "lucide-react";
import type { QueryHistoryEntry } from "../types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function QueriesView({
  history,
  onRerun,
}: {
  history: QueryHistoryEntry[];
  onRerun: (entry: QueryHistoryEntry) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
          <Search className="h-6 w-6 text-text-muted" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">No queries yet this session</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Searches you run from the Home view will appear here so you can re-run them quickly.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="mb-4 text-xs text-text-muted">
        Session-only — this list clears on page reload. {history.length} quer{history.length === 1 ? "y" : "ies"}.
      </p>
      <ul className="space-y-2.5">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted">
              <Dna className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {entry.biomarker || "—"} {entry.condition && `· ${entry.condition}`}
              </p>
              <p className="mt-0.5 text-xs text-text-muted">
                {entry.stage ? `${entry.stage} · ` : ""}
                {entry.resultCount} result{entry.resultCount !== 1 ? "s" : ""} · {formatTimestamp(entry.timestamp)}
              </p>
            </div>
            <button
              onClick={() => onRerun(entry)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-all duration-150 hover:border-primary/40 hover:bg-primary-muted hover:text-primary cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Re-run
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
