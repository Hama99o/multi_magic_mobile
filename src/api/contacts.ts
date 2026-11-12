/**
 * The Contacts app — `docs/design/contacts/SPEC.md`.
 *
 * Every call to `Api::V1::ContactApp::ContactsController` (+ its concerns and
 * `contacts/relations_controller.rb`), read 2026-11-12. Request bodies use the
 * SERVER's field names (`contact_params`), because nothing here converts case.
 *
 * ── EVERY PHONE AND EMAIL ─────────────────────────────────────────────────
 * A contact stores lists (`phones`, `emails`: `[{label, value}]`). The LIST
 * endpoint sent only the legacy first `phone` / `email` until multi_magic
 * `a0222268` (branch `contacts-api`, not deployed on 2026-11-12). So a row
 * without the lists falls back to the legacy value as a one-entry list, and
 * the detail (`show`, the full view) always has every entry.
 *
 * ── IMPORT NEEDS THE NEW SERVER, AND SAYS SO ──────────────────────────────
 * `import_vcard` read ONE card before `485e2db1`. A server that answers
 * without a `summary` is that server, and bulk import there would silently
 * keep one contact of fifty — `ImportNotSupported` is thrown instead.
 */
import { File, Paths } from "expo-file-system";
import { http } from "./http";
import { absoluteUrl } from "./conversations";
import { arr, id, obj, optStr, readableRows, str } from "./parse";

const BASE = "/api/v1/contact_app/contacts";
const PER_PAGE = 100;
/** A runaway pager must stop somewhere: 50 × 100 = 5000 contacts. */
const MAX_PAGES = 50;
const UPLOAD_TIMEOUT_MS = 120_000;

export type PhoneLabel = "mobile" | "home" | "work" | "other";
export type EmailLabel = "home" | "work" | "other";
export const PHONE_LABELS: readonly PhoneLabel[] = ["mobile", "home", "work", "other"];
export const EMAIL_LABELS: readonly EmailLabel[] = ["home", "work", "other"];

export type RelationKind = "parent" | "child" | "spouse" | "sibling" | "friend" | "colleague" | "neighbour" | "other";
export const RELATION_KINDS: readonly RelationKind[] = [
  "parent", "child", "spouse", "sibling", "friend", "colleague", "neighbour", "other",
];

export interface LabelledValue {
  /** Free text on the server: an imported card can carry "fax" or a custom label. */
  label: string;
  value: string;
}

export interface Address {
  label: string;
  street: string;
  city: string;
  state: string;
  postal: string;
  country: string;
}

export interface Relation {
  id: number;
  kind: RelationKind;
  /** The word for the tie, already gendered by the server ("father", "wife"). */
  label: string;
  relative: { id: number; name: string };
}

export interface Contact {
  id: number;
  firstname: string;
  lastname: string;
  nickname: string | null;
  company: string | null;
  jobTitle: string | null;
  favorite: boolean;
  /** `YYYY-MM-DD`. */
  birthDate: string | null;
  age: number | null;
  photoUrl: string | null;
  phones: LabelledValue[];
  emails: LabelledValue[];
  /** Full view only; [] from a list row. */
  addresses: Address[];
  website: string | null;
  notes: string | null;
  relations: Relation[];
  documentsCount: number;
  isSelf: boolean;
}

export interface ContactPayload {
  firstname: string;
  lastname: string;
  nickname: string;
  company: string;
  job_title: string;
  website: string;
  notes: string;
  favorite: boolean;
  birth_date: string | null;
  phones: LabelledValue[];
  emails: LabelledValue[];
  addresses: Address[];
}

export interface Birthday {
  contact: Contact;
  inDays: number;
  nextDate: string;
  turning: number | null;
}

export interface DuplicateGroup {
  reason: "email" | "name";
  contacts: { id: number; name: string; email: string | null }[];
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  total: number;
  skippedNames: string[];
  failedNames: string[];
}

export class ImportNotSupported extends Error {
  constructor() {
    super("import_vcard answered without a summary: this server imports one card per file");
    this.name = "ImportNotSupported";
  }
}

// ── parsing ────────────────────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function labelled(raw: unknown, fallbackValue: unknown, fallbackLabel: string): LabelledValue[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const e = entry as Record<string, unknown>;
      const value = text(e.value).trim();
      return value ? [{ label: text(e.label) || "other", value }] : [];
    });
  }
  const legacy = text(fallbackValue).trim();
  return legacy ? [{ label: fallbackLabel, value: legacy }] : [];
}

function addresses(raw: unknown): Address[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const a = {
      label: text(e.label) || "home",
      street: text(e.street),
      city: text(e.city),
      state: text(e.state),
      postal: text(e.postal),
      country: text(e.country),
    };
    return [a.street, a.city, a.postal, a.country].some((v) => v.trim()) ? [a] : [];
  });
}

function parseRelation(raw: unknown): Relation {
  const r = obj(raw, "relation");
  const relative = obj(r.relative, "relation.relative");
  return {
    id: id(r.id, "relation.id"),
    kind: str(r.kind, "relation.kind") as RelationKind,
    label: optStr(r.label) ?? str(r.kind, "relation.kind"),
    relative: { id: id(relative.id, "relation.relative.id"), name: text(relative.name) },
  };
}

function parseContact(raw: unknown): Contact {
  const c = obj(raw, "contact");
  const age = typeof c.age === "number" ? c.age : null;
  return {
    id: id(c.id, "contact.id"),
    firstname: text(c.firstname).trim(),
    lastname: text(c.lastname).trim(),
    nickname: optStr(c.nickname) || null,
    company: optStr(c.company) || null,
    jobTitle: optStr(c.job_title) || null,
    favorite: c.favorite === true,
    birthDate: optStr(c.birth_date),
    age,
    photoUrl: absoluteUrl(optStr(c.photo_url)),
    phones: labelled(c.phones, c.phone, "mobile"),
    emails: labelled(c.emails, c.email, "home"),
    addresses: addresses(c.addresses),
    website: optStr(c.website) || null,
    notes: optStr(c.notes) || null,
    relations: Array.isArray(c.relations) ? readableRows(c.relations, parseRelation).rows : [],
    documentsCount: Array.isArray(c.documents) ? c.documents.length : 0,
    isSelf: c.is_self === true,
  };
}

function parseImport(raw: unknown): ImportResult {
  const body = obj(raw, "import");
  if (!body.summary || typeof body.summary !== "object") throw new ImportNotSupported();
  const s = body.summary as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === "number" ? v : 0);
  const names = (list: unknown) =>
    Array.isArray(list) ? list.map((e) => text((e as Record<string, unknown> | null)?.name)).filter(Boolean) : [];
  return {
    created: count(s.created),
    skipped: count(s.skipped),
    failed: count(s.failed),
    total: count(s.total),
    skippedNames: names(body.skipped),
    failedNames: names(body.failed),
  };
}

/** The display name: what the server's `fullname` would say, without its casing. */
export function displayName(c: Pick<Contact, "firstname" | "lastname" | "nickname" | "company">): string {
  return `${c.firstname} ${c.lastname}`.trim() || c.nickname || c.company || "";
}

// ── calls ──────────────────────────────────────────────────────────────────

async function page(path: string, params: Record<string, unknown>, n: number) {
  const res = await http.get(path, { params: { ...params, page: n, per_page: PER_PAGE } });
  const body = obj(res.data, "contacts");
  const { rows } = readableRows(arr(body.contacts, "contacts"), parseContact);
  const meta = (body.meta ?? {}) as { pagy?: { pages?: unknown } };
  const pages = typeof meta.pagy?.pages === "number" ? meta.pagy.pages : 1;
  return { rows, pages };
}

/** Every page, in order, deduplicated by id (a contact edited between two
 *  page reads moves pages under the server's `updated_at` order). */
async function allPages(path: string, params: Record<string, unknown> = {}): Promise<Contact[]> {
  const first = await page(path, params, 1);
  const seen = new Map(first.rows.map((c) => [c.id, c]));
  for (let n = 2; n <= Math.min(first.pages, MAX_PAGES); n++) {
    for (const c of (await page(path, params, n)).rows) seen.set(c.id, c);
  }
  return [...seen.values()];
}

export const contactsApi = {
  list: (): Promise<Contact[]> => allPages(BASE),

  search: async (term: string): Promise<Contact[]> => (await page(BASE, { search: term.trim() }, 1)).rows,

  trash: (): Promise<Contact[]> => allPages(`${BASE}/trashes`),

  show: async (contactId: number): Promise<Contact> => {
    const res = await http.get(`${BASE}/${contactId}`);
    return parseContact(obj(res.data, "show").contact);
  },

  create: async (payload: ContactPayload): Promise<Contact> => {
    const res = await http.post(BASE, { contact: payload });
    return parseContact(obj(res.data, "create").contact);
  },

  update: async (contactId: number, payload: Partial<ContactPayload>): Promise<Contact> => {
    const res = await http.put(`${BASE}/${contactId}`, { contact: payload });
    return parseContact(obj(res.data, "update").contact);
  },

  setFavorite: (contactId: number, favorite: boolean) => contactsApi.update(contactId, { favorite }),

  /** To the trash; `restore` brings it back. */
  remove: async (contactId: number): Promise<void> => {
    await http.delete(`${BASE}/${contactId}`);
  },

  restore: async (contactId: number): Promise<void> => {
    await http.put(`${BASE}/${contactId}/restore`);
  },

  destroyForever: async (contactId: number): Promise<void> => {
    await http.delete(`${BASE}/${contactId}/destroy_permanently`);
  },

  uploadPhoto: async (contactId: number, file: { uri: string; name: string; mimeType: string }): Promise<Contact> => {
    const form = new FormData();
    form.append("photo", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    const res = await http.post(`${BASE}/${contactId}/upload_photo`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return parseContact(obj(res.data, "photo").contact);
  },

  removePhoto: async (contactId: number): Promise<Contact> => {
    const res = await http.delete(`${BASE}/${contactId}/remove_photo`);
    return parseContact(obj(res.data, "photo").contact);
  },

  addRelation: async (contactId: number, relativeId: number, kind: RelationKind): Promise<Relation[]> => {
    const res = await http.post(`${BASE}/${contactId}/relations`, { relative_id: relativeId, kind });
    return readableRows(arr(obj(res.data, "relations").relations, "relations"), parseRelation).rows;
  },

  removeRelation: async (contactId: number, relationId: number): Promise<void> => {
    await http.delete(`${BASE}/${contactId}/relations/${relationId}`);
  },

  birthdays: async (withinDays = 30): Promise<Birthday[]> => {
    const res = await http.get(`${BASE}/upcoming_birthdays`, { params: { within: withinDays } });
    return readableRows(arr(obj(res.data, "birthdays").birthdays, "birthdays"), (raw) => {
      const b = obj(raw, "birthday");
      return {
        contact: parseContact(b.contact),
        inDays: id(b.in_days, "birthday.in_days"),
        nextDate: str(b.next_date, "birthday.next_date"),
        turning: typeof b.turning === "number" ? b.turning : null,
      };
    }).rows;
  },

  duplicates: async (): Promise<DuplicateGroup[]> => {
    const res = await http.get(`${BASE}/duplicates`);
    const body = obj(res.data, "duplicates");
    const groups = (list: unknown, reason: DuplicateGroup["reason"]): DuplicateGroup[] =>
      (Array.isArray(list) ? list : []).flatMap((g) => {
        const members = (g as { contacts?: unknown })?.contacts;
        if (!Array.isArray(members)) return [];
        return [{
          reason,
          contacts: members.flatMap((m) => {
            const e = m as Record<string, unknown>;
            return typeof e?.id === "number" ? [{ id: e.id, name: text(e.fullname), email: optStr(e.email) }] : [];
          }),
        }];
      });
    return [...groups(body.by_email, "email"), ...groups(body.by_name, "name")];
  },

  /** One chunk of vCard text. `ImportNotSupported` on a one-card server. */
  importVcf: async (vcf: string): Promise<ImportResult> => {
    const res = await http.post(`${BASE}/import_vcard`, { vcf }, {
      timeout: UPLOAD_TIMEOUT_MS,
      // 200 (all already there) and 422 (none could be saved) both carry the
      // summary; only a refusal without one is an error.
      validateStatus: (status) => status === 200 || status === 201 || (status === 422),
    });
    if (res.status === 422 && !(res.data as { summary?: unknown })?.summary) {
      const message = text((res.data as { message?: unknown })?.message);
      throw Object.assign(new Error(message || "import refused"), { response: res, isAxiosError: true });
    }
    return parseImport(res.data);
  },

  /** The vCard text of one contact, or of several (`"all"` = the whole book). */
  exportVcf: async (which: number | number[] | "all"): Promise<string> => {
    const res =
      typeof which === "number"
        ? await http.get(`${BASE}/${which}/export_vcard`, { responseType: "text" })
        : await http.get(`${BASE}/export_multiple_contacts`, {
            params: which === "all" ? { all: true } : { ids: which },
            responseType: "text",
          });
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  },
};

/** Writes vCard text to the cache, for the share sheet. The caller deletes it. */
export function vcfFile(textBody: string, name: string): File {
  const safe = name.replace(/[^\p{L}\p{N}._ -]/gu, "").trim().slice(0, 60) || "contacts";
  const file = new File(Paths.cache, `${safe}.vcf`);
  if (file.exists) file.delete();
  file.create();
  file.write(textBody);
  return file;
}

export const __parse = { parseContact, parseImport };
