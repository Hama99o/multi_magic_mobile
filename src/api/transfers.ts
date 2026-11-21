/**
 * TRANSFERS: the work Pages does in the background (parity audit #12, #25,
 * #28, #33, #34). Export a space or a folder as a ZIP, import a ZIP (as a
 * new space, or into a folder), and a copy too big to make at once. The
 * server answers a transfer; the phone follows it (`GET /transfers/:id`,
 * the web follows over ActionCable) until it is `done` or `failed`, then
 * downloads the ZIP (`artifact_url`) or opens what was made
 * (`result_space_id`, `result_node_id`).
 */
import { absoluteUrl } from "./conversations";
import { http } from "./http";
import { num, obj, optStr } from "./parse";

export type TransferKind = "export" | "import" | "copy";
export type TransferState = "enqueued" | "processing" | "done" | "failed";

export interface Transfer {
  id: number;
  kind: TransferKind;
  /** Kept as sent: an unknown state is never taken for finished. */
  state: TransferState | string;
  /** 0–100. */
  progress: number;
  message: string | null;
  error: string | null;
  resultSpaceId: number | null;
  resultNodeId: number | null;
  artifactUrl: string | null;
  artifactFilename: string | null;
}

const optNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseTransfer(raw: unknown): Transfer {
  const r = obj(raw, "transfer");
  const kind = r.kind === "import" || r.kind === "copy" ? r.kind : "export";
  return {
    id: num(r.id, "id"),
    kind,
    state: typeof r.state === "string" ? r.state : "enqueued",
    progress: Math.min(100, Math.max(0, optNum(r.progress) ?? 0)),
    message: optStr(r.message),
    error: optStr(r.error),
    resultSpaceId: optNum(r.result_space_id),
    resultNodeId: optNum(r.result_node_id),
    // `rails_blob_url` names the server's own host: localhost on a dev stack.
    artifactUrl: absoluteUrl(optStr(r.artifact_url)),
    artifactFilename: optStr(r.artifact_filename),
  };
}

export const isFinished = (t: Transfer) => t.state === "done" || t.state === "failed";

const transferOf = (data: unknown) => parseTransfer(obj(data, "transfer response").transfer);

export const transfersApi = {
  show: async (id: number): Promise<Transfer> => transferOf((await http.get(`/api/v1/page_app/transfers/${id}`)).data),
  exportSpace: async (spaceId: number): Promise<Transfer> => transferOf((await http.post("/api/v1/page_app/transfers/export", { space_id: spaceId })).data),
  exportNode: async (spaceId: number, nodeId: number): Promise<Transfer> =>
    transferOf((await http.post("/api/v1/page_app/transfers/export", { space_id: spaceId, node_id: nodeId })).data),
  /** No target: the ZIP becomes a new space. */
  importZip: async (file: { uri: string; name: string; mimeType: string | null }, to: { spaceId?: number; parentNodeId?: number | null }): Promise<Transfer> => {
    const form = new FormData();
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/zip" } as unknown as Blob);
    if (to.spaceId) form.append("space_id", String(to.spaceId));
    if (to.spaceId && to.parentNodeId) form.append("parent_node_id", String(to.parentNodeId));
    const res = await http.post("/api/v1/page_app/transfers/import", form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 0 });
    return transferOf(res.data);
  },
  cancel: async (id: number): Promise<void> => {
    await http.delete(`/api/v1/page_app/transfers/${id}`);
  },
};
