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
 *
 * ── DOCUMENTS (ID card, passport…) ────────────────────────────────────────
 * Not an endpoint of their own: the FULL view carries them (serializer
 * `documents`, no paging, no date), and every write (`upload_documents`,
 * `PATCH/DELETE documents/:id`) answers with the full contact again. The
 * server keeps images (png, jpeg, gif, webp) and PDF under 20 MB
 * (`ContactApp::Contact` validations) and answers 422 `{errors}` otherwise;
 * `documentRefusal` says so before the bytes leave the phone.
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

/** `ContactApp::Family` enums, read at 6de97a32. Gender turns "parent" into
 *  father or mother; closeness is how close the user is to this person. */
export type Gender = "unknown" | "male" | "female" | "other";
export const GENDERS: readonly Gender[] = ["unknown", "male", "female", "other"];
export type Closeness = "unset" | "close" | "regular" | "distant" | "estranged";
export const CLOSENESS: readonly Closeness[] = ["unset", "close", "regular", "distant", "estranged"];
/** The web drawer's `SOCIAL_LABELS`; the server keeps any label. */
export const SOCIAL_LABELS: readonly string[] = ["linkedin", "twitter", "instagram", "facebook", "github", "website", "other"];
/** `ContactApp::Relation` qualifier and status. A step-father, a former wife. */
export type Qualifier = "biological" | "step" | "adoptive" | "half" | "in_law";
const QUALIFIERS: readonly Qualifier[] = ["biological", "step", "adoptive", "half", "in_law"];
export type RelationStatus = "current" | "former";

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
  qualifier: Qualifier;
  status: RelationStatus;
  /** The server's English word for the tie ("half-sister"): the fallback when
   *  `relationWord` has no translation for it. */
  label: string;
  relative: { id: number; name: string; gender: Gender; age: number | null; deceased: boolean; isSelf: boolean };
}

/** One file on a contact (serializer `documents`, read at 6de97a32). */
export interface ContactDocument {
  /** The attachment's id: what rename and delete take. */
  id: number;
  filename: string;
  byteSize: number;
  contentType: string;
  /** Absolute storage-proxy url. */
  url: string;
  /** A 300 px preview, for an image or a PDF; null when none can be made. */
  thumbnailUrl: string | null;
}

/** `ContactApp::Contact::DOCUMENT_CONTENT_TYPES`. */
export const DOCUMENT_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"];
/** `size: { less_than: 20.megabytes }`: 20 MiB itself is refused. */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" };

/** The file's type, from the picker or else from its extension (Rails sniffs the bytes too). */
export function documentType(file: { name: string; mimeType: string | null }): string | null {
  if (file.mimeType) return file.mimeType.toLowerCase();
  const ext = file.name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? "";
  return DOCUMENT_EXT[ext] ?? null;
}

/** Why the server would refuse this file, or null when it would keep it. */
export function documentRefusal(file: { name: string; mimeType: string | null; size: number | null }): "type" | "size" | null {
  const type = documentType(file);
  if (!type || !DOCUMENT_TYPES.includes(type)) return "type";
  if (file.size != null && file.size >= DOCUMENT_MAX_BYTES) return "size";
  return null;
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
  /** Full view only, newest first. null from a list row: not known, not none. */
  documents: ContactDocument[] | null;
  isSelf: boolean;
  /** Full view only; [] from a list row. */
  socialLinks: LabelledValue[];
  tags: string[];
  gender: Gender;
  closeness: Closeness;
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
  social_links: LabelledValue[];
  tags: string[];
  gender: Gender;
  closeness: Closeness;
}

/** Who a new tie points at: someone in the book, or a person made in the same call. */
export type RelationTarget =
  | { relativeId: number }
  | { relative: { firstname: string; lastname: string; gender?: Gender } };

/** The family around one contact (`ContactApp::FamilyTree`): generation 0 is
 *  that contact, -1 their parents, +1 their children. */
export interface FamilyNode {
  id: number;
  name: string;
  generation: number;
  gender: Gender;
  /** What they are to the root, in the server's English ("sister"); null for the root. */
  relation: string | null;
  isSelf: boolean;
  deceased: boolean;
  age: number | null;
}
export interface FamilyTree {
  rootId: number;
  nodes: FamilyNode[];
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

/** One of `allowed`, or the first (the server's default) for anything else. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  return allowed.includes(value as T) ? (value as T) : allowed[0];
}

function parseRelation(raw: unknown): Relation {
  const r = obj(raw, "relation");
  const relative = obj(r.relative, "relation.relative");
  return {
    id: id(r.id, "relation.id"),
    kind: str(r.kind, "relation.kind") as RelationKind,
    qualifier: oneOf(r.qualifier, QUALIFIERS),
    status: r.status === "former" ? "former" : "current",
    label: optStr(r.label) ?? str(r.kind, "relation.kind"),
    relative: {
      id: id(relative.id, "relation.relative.id"),
      name: text(relative.name),
      gender: oneOf(relative.gender, GENDERS),
      age: typeof relative.age === "number" ? relative.age : null,
      deceased: Boolean(optStr(relative.deceased_on)),
      isSelf: relative.is_self === true,
    },
  };
}

function parseTags(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "") : [];
}

function parseTree(raw: unknown): FamilyTree {
  const body = obj(raw, "family");
  const nodes = readableRows(arr(body.nodes, "family.nodes"), (n) => {
    const node = obj(n, "family.node");
    return {
      id: id(node.id, "family.node.id"),
      name: text(node.name),
      generation: typeof node.generation === "number" ? node.generation : 0,
      gender: oneOf(node.gender, GENDERS),
      relation: optStr(node.relation) || null,
      isSelf: node.is_self === true,
      deceased: Boolean(optStr(node.deceased_on)),
      age: typeof node.age === "number" ? node.age : null,
    };
  }).rows;
  return { rootId: id(body.root_id, "family.root_id"), nodes };
}

function parseDocument(raw: unknown): ContactDocument {
  const d = obj(raw, "document");
  return {
    id: id(d.id, "document.id"),
    filename: text(d.filename) || String(d.id),
    byteSize: typeof d.byte_size === "number" ? d.byte_size : 0,
    contentType: text(d.content_type),
    url: absoluteUrl(str(d.url, "document.url")) ?? "",
    thumbnailUrl: absoluteUrl(optStr(d.thumbnail_url)),
  };
}

/** Newest first (owner rule, 2026-11-09). The server sends attachment order,
 *  oldest first, and no date: the attachment id grows with each upload. */
function parseDocuments(raw: unknown): ContactDocument[] | null {
  if (!Array.isArray(raw)) return null;
  return readableRows(raw, parseDocument).rows.sort((a, b) => b.id - a.id);
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
    documents: parseDocuments(c.documents),
    isSelf: c.is_self === true,
    socialLinks: labelled(c.social_links, null, "other"),
    tags: parseTags(c.tags),
    gender: oneOf(c.gender, GENDERS),
    closeness: oneOf(c.closeness, CLOSENESS),
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

  /** Every page of matches (a common first name can match more than 100). */
  search: (term: string): Promise<Contact[]> => allPages(BASE, { search: term.trim() }),

  trash: (): Promise<Contact[]> => allPages(`${BASE}/trashes`),

  show: async (contactId: number): Promise<Contact> => {
    const res = await http.get(`${BASE}/${contactId}`);
    return parseContact(obj(res.data, "show").contact);
  },

  create: async (payload: ContactPayload): Promise<Contact> => {
    const res = await http.post(BASE, { contact: payload });
    return parseContact(obj(res.data, "create").contact);
  },

  update: async (contactId: number, payload: Partial<ContactPayload> & { is_self?: boolean }): Promise<Contact> => {
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

  /** Several at once, as the web sends them (`documents[]`). */
  uploadDocuments: async (contactId: number, files: { uri: string; name: string; mimeType: string }[]): Promise<Contact> => {
    const form = new FormData();
    for (const file of files) {
      form.append("documents[]", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    }
    const res = await http.post(`${BASE}/${contactId}/upload_documents`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return parseContact(obj(res.data, "documents").contact);
  },

  renameDocument: async (contactId: number, documentId: number, filename: string): Promise<Contact> => {
    const res = await http.patch(`${BASE}/${contactId}/documents/${documentId}`, { filename });
    return parseContact(obj(res.data, "document").contact);
  },

  removeDocument: async (contactId: number, documentId: number): Promise<Contact> => {
    const res = await http.delete(`${BASE}/${contactId}/documents/${documentId}`);
    return parseContact(obj(res.data, "document").contact);
  },

  /** Link someone in the book, or make the person and link them in one call
   *  (`RelationsController#create`). The web always sends the qualifier. */
  addRelation: async (contactId: number, tie: RelationTarget & { kind: RelationKind; qualifier: Qualifier }): Promise<Relation[]> => {
    const target = "relativeId" in tie ? { relative_id: tie.relativeId } : { relative: tie.relative };
    const res = await http.post(`${BASE}/${contactId}/relations`, { ...target, kind: tie.kind, qualifier: tie.qualifier });
    return readableRows(arr(obj(res.data, "relations").relations, "relations"), parseRelation).rows;
  },

  /** "I put my sister down as my father": a new role (and the relative's
   *  gender, which the wrong role set wrong too), or a new qualifier. */
  updateRelation: async (
    contactId: number,
    relationId: number,
    change: { kind?: RelationKind; relativeGender?: Gender; qualifier?: Qualifier },
  ): Promise<Relation[]> => {
    const body = { kind: change.kind, relative_gender: change.relativeGender, qualifier: change.qualifier };
    const res = await http.patch(`${BASE}/${contactId}/relations/${relationId}`, body);
    return readableRows(arr(obj(res.data, "relations").relations, "relations"), parseRelation).rows;
  },

  /** Which contact is the user: the root the family is measured from. Only
   *  one can be; marking another moves the mark (`clear_other_self`). */
  setSelf: (contactId: number, isSelf: boolean) => contactsApi.update(contactId, { is_self: isSelf }),

  /**
   * The user's family, the web's "My Family" tab (`FamilyTab.tsx`): everyone
   * reachable through family ties from the contact marked as the user, each
   * with what they are to them (`family_label`: "mother", "cousin"; null when
   * no word fits). Without a contact marked as the user, `selfId` is null and
   * the list is everyone with any family tie. `family_label` is an English
   * word from the server, as on the web: a server-side gap for French.
   */
  familyMembers: async (): Promise<{ selfId: number | null; members: (Contact & { familyLabel: string | null })[] }> => {
    const body = (await http.get(`${BASE}/family_members`)).data as { self_id?: unknown; contacts?: unknown };
    const rows = Array.isArray(body?.contacts) ? body.contacts : [];
    return {
      selfId: typeof body?.self_id === "number" ? body.self_id : null,
      members: rows.map((raw) => {
        const label = (raw as { family_label?: unknown }).family_label;
        return { ...parseContact(raw), familyLabel: typeof label === "string" && label ? label : null };
      }),
    };
  },

  /** A gendered role ("father") tells the card a gender it did not have. */
  setGender: (contactId: number, gender: Gender) => contactsApi.update(contactId, { gender }),

  family: async (contactId: number): Promise<FamilyTree> => parseTree((await http.get(`${BASE}/${contactId}/family`)).data),

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

export const __parse = { parseContact, parseImport, parseDocument, parseTree };
