import { CheckCircle, AlertTriangle, Info } from "lucide-react";
import { supabase } from "../utils/supabaseClient";

export default function SettingsView() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const projectHost = supabaseUrl ? new URL(supabaseUrl).host : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-xl border border-border-subtle bg-surface-raised p-5">
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Connections</h2>

        <div className="flex items-center justify-between rounded-lg bg-surface px-3.5 py-3 text-sm">
          <div>
            <p className="font-medium text-text-primary">Supabase</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {projectHost ? `Unmatched Registry storage — ${projectHost}` : "Not configured"}
            </p>
          </div>
          {supabase ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2.5 py-1 text-xs font-semibold text-success">
              <CheckCircle className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive-muted px-2.5 py-1 text-xs font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              Not connected
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface px-3.5 py-3 text-sm">
          <div>
            <p className="font-medium text-text-primary">ClinicalTrials.gov</p>
            <p className="mt-0.5 text-xs text-text-muted">Public search API — no key required</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle className="h-3.5 w-3.5" />
            Connected
          </span>
        </div>
      </section>

      <section className="rounded-xl border border-border-subtle bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">About Session Data</h2>
        <div className="flex items-start gap-2.5 rounded-lg bg-surface px-3.5 py-3 text-xs text-text-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <p>
            Query and Pathology history are kept in memory for this browser session only and clear on reload.
            Unmatched Patient Registry records are the only data persisted, stored de-identified (disease,
            biomarker, stage, lab values — no patient names or identifiers) in the connected Supabase project.
          </p>
        </div>
      </section>
    </div>
  );
}
