/**
 * TABLE FORMS (increment 8; `forms_controller.rb`, `form_presenter.rb`): the
 * forms people fill to add rows to a table, built by the base's editors.
 * The page people FILL is the web's `/f/:slug` (the parity audit's decision
 * (a): opened in the browser), so the phone builds, shares and reads the
 * answers, and never fills.
 *
 * Invites send an EMAIL to each address: a message to a real person, so the
 * screen says so before it sends, and no device run ever invites a real one.
 */
import { API_URL } from "@/config/env";
import { http } from "./http";
import { arr, id, obj, optStr, readable } from "./parse";

const BASE = "/api/v1/table_app";

export const ACCESS_MODES = ["public", "signed_in", "only_me", "invited"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

/** One question: a table column, with its wording on the form. */
export interface FormQuestion {
  fieldId: number;
  label: string | null;
  help: string | null;
  placeholder: string | null;
  required: boolean;
  hidden: boolean;
}

export interface FormSettings {
  title?: string | null;
  intro?: string | null;
  submit_label?: string | null;
  success_message?: string | null;
  language?: string | null;
  cover_color?: string | null;
}

export interface AvailableField {
  id: number;
  name: string;
  fieldType: string;
  required: boolean;
  /** Whether a form can ask it (`TableApp::Form::FIELD_TYPES`). */
  supported: boolean;
}

export interface FormInvite {
  id: number;
  email: string;
  joined: boolean;
  usedAt: string | null;
}

export interface TableForm {
  id: number;
  tableId: number;
  name: string;
  slug: string;
  accessMode: AccessMode;
  questions: FormQuestion[];
  settings: FormSettings;
  accepting: boolean;
  allowMultiple: boolean;
  closesAt: string | null;
  maxSubmissions: number | null;
  submissionsCount: number;
  closed: boolean;
  coverUrl: string | null;
  availableFields: AvailableField[];
  invites: FormInvite[];
}

export type FormListItem = Pick<TableForm, "id" | "tableId" | "name" | "slug" | "accessMode" | "accepting" | "closed" | "submissionsCount">;

export interface FormSubmission {
  id: number;
  createdAt: string;
  recordId: number | null;
  recordTitle: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
}

const bool = (v: unknown) => v === true;
const access = (v: unknown): AccessMode => ((ACCESS_MODES as readonly string[]).includes(String(v)) ? (v as AccessMode) : "public");

function parseListItem(raw: unknown): FormListItem {
  const f = obj(raw, "form");
  return { id: id(f.id, "form.id"), tableId: id(f.table_id, "form.table_id"), name: optStr(f.name) ?? "", slug: optStr(f.slug) ?? "", accessMode: access(f.access_mode), accepting: bool(f.accepting), closed: bool(f.closed), submissionsCount: typeof f.submissions_count === "number" ? f.submissions_count : 0 };
}

export function parseForm(raw: unknown): TableForm {
  const f = obj(raw, "form");
  const settings = f.settings && typeof f.settings === "object" ? (f.settings as FormSettings) : {};
  return {
    ...parseListItem(raw),
    questions: readable(Array.isArray(f.fields) ? f.fields : [], (q) => {
      const x = obj(q, "question");
      return { fieldId: id(x.field_id, "question.field_id"), label: optStr(x.label), help: optStr(x.help), placeholder: optStr(x.placeholder), required: bool(x.required), hidden: bool(x.hidden) };
    }),
    settings,
    allowMultiple: bool(f.allow_multiple),
    closesAt: optStr(f.closes_at),
    maxSubmissions: typeof f.max_submissions === "number" ? f.max_submissions : null,
    coverUrl: optStr(f.cover_url) ? `${API_URL}${optStr(f.cover_url)}` : null,
    availableFields: readable(Array.isArray(f.available_fields) ? f.available_fields : [], (a) => {
      const x = obj(a, "available_field");
      return { id: id(x.id, "available_field.id"), name: optStr(x.name) ?? "", fieldType: optStr(x.field_type) ?? "", required: bool(x.required), supported: bool(x.supported) };
    }),
    invites: readable(Array.isArray(f.invites) ? f.invites : [], (i) => {
      const x = obj(i, "invite");
      return { id: id(x.id, "invite.id"), email: optStr(x.email) ?? "", joined: bool(x.joined), usedAt: optStr(x.used_at) };
    }),
  };
}

/** The page people fill (the web's `FormBuilder` link). */
export const publicFormUrl = (slug: string) => `${API_URL}/f/${slug}`;

/** A change to a form, in the server's names (`FormsController::PERMITTED`). Settings merge on the server. */
export interface FormChanges {
  name?: string;
  accessMode?: AccessMode;
  accepting?: boolean;
  allowMultiple?: boolean;
  closesAt?: string | null;
  maxSubmissions?: number | null;
  settings?: FormSettings;
  questions?: FormQuestion[];
}

export function formBody(c: FormChanges): { form: Record<string, unknown> } {
  const form: Record<string, unknown> = {};
  if (c.name !== undefined) form.name = c.name;
  if (c.accessMode !== undefined) form.access_mode = c.accessMode;
  if (c.accepting !== undefined) form.accepting = c.accepting;
  if (c.allowMultiple !== undefined) form.allow_multiple = c.allowMultiple;
  if (c.closesAt !== undefined) form.closes_at = c.closesAt;
  if (c.maxSubmissions !== undefined) form.max_submissions = c.maxSubmissions;
  if (c.settings !== undefined) form.settings = c.settings;
  if (c.questions !== undefined) form.fields = c.questions.map((q) => ({ field_id: q.fieldId, label: q.label ?? "", help: q.help ?? "", placeholder: q.placeholder ?? "", required: q.required, hidden: q.hidden }));
  return { form };
}

export const tableFormsApi = {
  async list(tableId: number): Promise<FormListItem[]> {
    const { data } = await http.get(`${BASE}/tables/${tableId}/forms`);
    return readable(arr(obj(data, "forms response").forms, "forms"), parseListItem);
  },
  /** A new form asks every column it can (`Form.default_fields`). */
  async create(tableId: number, name?: string): Promise<TableForm> {
    const { data } = await http.post(`${BASE}/tables/${tableId}/forms`, { form: name ? { name } : {} });
    return parseForm(obj(data, "form response").form);
  },
  async show(formId: number): Promise<TableForm> {
    const { data } = await http.get(`${BASE}/forms/${formId}`);
    return parseForm(obj(data, "form response").form);
  },
  async update(formId: number, changes: FormChanges): Promise<TableForm> {
    const { data } = await http.patch(`${BASE}/forms/${formId}`, formBody(changes));
    return parseForm(obj(data, "form response").form);
  },
  async destroy(formId: number): Promise<void> {
    await http.delete(`${BASE}/forms/${formId}`);
  },
  /** Newest first, 50 a page (`?offset=`). */
  async submissions(formId: number, offset: number): Promise<{ rows: FormSubmission[]; total: number }> {
    const { data } = await http.get(`${BASE}/forms/${formId}/submissions`, { params: { offset } });
    const body = obj(data, "submissions response");
    const meta = body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : {};
    return {
      rows: readable(arr(body.submissions, "submissions"), (raw) => {
        const s = obj(raw, "submission");
        return { id: id(s.id, "submission.id"), createdAt: optStr(s.created_at) ?? "", recordId: typeof s.record_id === "number" ? s.record_id : null, recordTitle: optStr(s.record_title), submitterEmail: optStr(s.submitter_email), submitterName: optStr(s.submitter_name) };
      }),
      total: typeof meta.total_count === "number" ? meta.total_count : 0,
    };
  },
  /** Sends an invitation EMAIL to each new address. The server skips what it already has, and says why. */
  async invite(formId: number, emails: string[]): Promise<{ invited: string[]; skipped: unknown[]; form: TableForm }> {
    const { data } = await http.post(`${BASE}/forms/${formId}/invites`, { emails });
    const body = obj(data, "invite response");
    return { invited: Array.isArray(body.invited) ? body.invited.map(String) : [], skipped: Array.isArray(body.skipped) ? body.skipped : [], form: parseForm(body.form) };
  },
  async uninvite(formId: number, inviteId: number): Promise<TableForm> {
    const { data } = await http.delete(`${BASE}/forms/${formId}/invites/${inviteId}`);
    return parseForm(obj(data, "form response").form);
  },
  async resend(formId: number, inviteId: number): Promise<void> {
    await http.post(`${BASE}/forms/${formId}/invites/${inviteId}/resend`);
  },
  /** An image above the form, 5 MB at most, in the base owner's storage. */
  async uploadCover(formId: number, file: { uri: string; name: string; mimeType: string }): Promise<TableForm> {
    const form = new FormData();
    form.append("cover", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    const { data } = await http.put(`${BASE}/forms/${formId}/cover`, form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 120_000 });
    return parseForm(obj(data, "form response").form);
  },
  async removeCover(formId: number): Promise<TableForm> {
    const { data } = await http.delete(`${BASE}/forms/${formId}/cover`);
    return parseForm(obj(data, "form response").form);
  },
};
