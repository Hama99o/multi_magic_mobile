/**
 * EXPORT, what happens after "Export as Excel" (increment 7; the web's export
 * menu): the server answers ready for a small view, or makes a big one in the
 * background (`TableApp::ExportJob`). The phone waits a little for it (the
 * web polls too), then hands the file to the share sheet; past that wait it
 * says the bell will ring when the file is ready, rather than keep a spinner.
 * Pure (the waiting is injected), so each outcome is a test.
 */
import type { TableExport } from "@/api/tables";

export type ExportOutcome = { kind: "ready"; export: TableExport } | { kind: "background"; export: TableExport } | { kind: "failed"; message: string | null };

export const POLL_EVERY_MS = 1500;
export const POLL_TRIES = 20; // about 30 s, then the bell takes over

export async function settleExport(started: TableExport, status: (id: number) => Promise<TableExport>, wait: (ms: number) => Promise<void>, tries = POLL_TRIES): Promise<ExportOutcome> {
  let current = started;
  for (let i = 0; ; i++) {
    if (current.ready) return { kind: "ready", export: current };
    if (current.status === "failed") return { kind: "failed", message: current.errorMessage };
    if (i >= tries) return { kind: "background", export: current };
    await wait(POLL_EVERY_MS);
    current = await status(current.id);
  }
}
