import { FileText, CheckCircle, AlertTriangle } from "lucide-react";
import type { PathologyHistoryEntry } from "../types";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PathologyView({ history }: { history: PathologyHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
          <FileText className="h-6 w-6 text-text-muted" />
        </div>
        <h2 className="font-heading text-lg font-medium text-text-primary">No reports uploaded yet</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Pathology / NGS reports uploaded from the Home view will appear here for this session.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="mb-4 text-xs text-text-muted">
        Session-only — this list clears on page reload. {history.length} report{history.length !== 1 ? "s" : ""}.
      </p>
      <ul className="space-y-2.5">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3"
          >
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                entry.success ? "bg-accent-muted" : "bg-destructive-muted"
              }`}
            >
              <FileText className={`h-4 w-4 ${entry.success ? "text-accent" : "text-destructive"}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{entry.fileName}</p>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {entry.success
                  ? `${entry.biomarker || "Unknown biomarker"} · ${entry.disease || "Unknown disease"}`
                  : "Extraction failed or invalid document"}
                {" · "}
                {formatTimestamp(entry.timestamp)}
              </p>
            </div>
            {entry.success ? (
              <CheckCircle className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
