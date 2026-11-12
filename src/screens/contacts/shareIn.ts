/**
 * What another app shares INTO MultiMagic, and where it goes (owner,
 * 2026-11-12, `docs/design/contacts/SPEC.md` §F):
 *
 *   a contact card (.vcf file or vCard text) → Contacts — one card opens a
 *                                               filled-in new contact, several
 *                                               go through the bulk import
 *   text holding a number or an email        → "add as a contact"
 *   photos, videos, documents                → Pages, as before
 *   plain text with neither                  → nowhere: Pages keeps files,
 *                                               and a sentence is not one
 *
 * A mix of a card and a photo goes to Pages rather than drop the photo.
 */
import type { Address, LabelledValue } from "@/api/contacts";

export interface SharedFile {
  path: string;
  mimeType?: string | null;
  fileName?: string | null;
}

export type ShareRoute =
  | { kind: "vcards"; files: string[] }
  | { kind: "vcardText"; text: string }
  | { kind: "bits"; text: string; phones: string[]; emails: string[] }
  | { kind: "files" }
  | { kind: "nothing" };

const VCARD_TYPES = /^text\/(x-)?vcard$|^text\/directory$/i;

export function isVcardFile(f: SharedFile): boolean {
  return VCARD_TYPES.test(f.mimeType ?? "") || /\.vcf$/i.test(f.fileName ?? f.path);
}

function asUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

// ── numbers and emails in free text ─────────────────────────────────────────

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** A run that starts with +, 00, ( or a digit, and holds digits with the
 *  separators people type: spaces, dots, dashes, brackets. */
const PHONE = /(?:\+|\b00|\(|\b)\d[\d\s().-]{5,}\d/g;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/;

export function detectContactBits(text: string): { phones: string[]; emails: string[] } {
  const emails = [...new Set(text.match(EMAIL) ?? [])];
  const withoutEmails = text.replace(EMAIL, " ");
  const phones: string[] = [];
  for (const raw of withoutEmails.match(PHONE) ?? []) {
    const candidate = raw.trim().replace(/[.,;:]+$/, "");
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) continue;
    if (DATE_LIKE.test(candidate)) continue;
    // A thousands-separated amount ("1 250 000") is groups of exactly three.
    if (/^\d{1,3}( \d{3})+$/.test(candidate)) continue;
    if (!phones.some((p) => p.replace(/\D/g, "") === digits)) phones.push(candidate);
  }
  return { phones, emails };
}

export function classifyShare({ files, text }: { files: SharedFile[] | null; text: string | null }): ShareRoute {
  const list = files ?? [];
  if (list.length) {
    return list.every(isVcardFile) ? { kind: "vcards", files: list.map((f) => asUri(f.path)) } : { kind: "files" };
  }
  const body = (text ?? "").trim();
  if (!body) return { kind: "nothing" };
  if (/BEGIN:VCARD/i.test(body)) return { kind: "vcardText", text: text ?? "" };
  const bits = detectContactBits(body);
  if (bits.phones.length || bits.emails.length) return { kind: "bits", text: body, ...bits };
  return { kind: "nothing" };
}

// ── one card → the form's fields ────────────────────────────────────────────

export interface ParsedCard {
  firstname: string;
  lastname: string;
  nickname: string;
  company: string;
  jobTitle: string;
  website: string;
  notes: string;
  birthDate: string | null;
  phones: LabelledValue[];
  emails: LabelledValue[];
  addresses: Address[];
  photo: { base64: string; mimeType: string } | null;
}

const TYPE_LABELS: Record<string, string> = { cell: "mobile", mobile: "mobile", iphone: "mobile", home: "home", work: "work", other: "other" };
const PHOTO_TYPES: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** UTF-8 bytes → text, by hand: Hermes does not promise `TextDecoder`. */
function utf8(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const n = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
    let code = n ? b & (0x3f >> n) : b;
    for (let k = 1; k <= n; k++) code = (code << 6) | ((bytes[i + k] ?? 0) & 0x3f);
    out += String.fromCodePoint(code);
    i += n + 1;
  }
  return out;
}

/** Quoted-printable → text. The encoded bytes are UTF-8 (Android's export). */
function decodeQp(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const hex = value.slice(i + 1, i + 3);
    if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      // A literal character: its own UTF-8 bytes.
      const code = value.codePointAt(i) ?? 0;
      if (code > 0xffff) i += 1;
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return utf8(bytes);
}

function unescape(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c.toLowerCase() === "n" ? "\n" : c));
}

function logicalLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const last = out[out.length - 1];
    const qpOpen = last != null && last.endsWith("=") && /QUOTED-PRINTABLE/i.test(last.split(":")[0] ?? "");
    if (last != null && qpOpen) out[out.length - 1] = last.slice(0, -1) + raw.trimStart();
    else if (last != null && /^[ \t]/.test(raw)) out[out.length - 1] = last + raw.slice(1);
    else out.push(raw);
  }
  return out;
}

interface Prop {
  group: string | null;
  name: string;
  params: Record<string, string>;
  types: string[];
  value: string;
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [head, ...paramParts] = line.slice(0, colon).split(";");
  const dot = head.indexOf(".");
  const group = dot >= 0 ? head.slice(0, dot).toLowerCase() : null;
  const name = (dot >= 0 ? head.slice(dot + 1) : head).toUpperCase();
  const params: Record<string, string> = {};
  const types: string[] = [];
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq < 0) types.push(p.toLowerCase());
    else {
      const key = p.slice(0, eq).toUpperCase();
      const val = p.slice(eq + 1).replace(/"/g, "");
      params[key] = val;
      if (key === "TYPE") types.push(...val.toLowerCase().split(","));
    }
  }
  let value = line.slice(colon + 1);
  if ((params.ENCODING ?? "").toUpperCase() === "QUOTED-PRINTABLE" || types.includes("quoted-printable")) value = decodeQp(value);
  return { group, name, params, types, value };
}

const split = (value: string) => value.split(/(?<!\\);/).map(unescape);

export function parseCard(text: string): ParsedCard {
  const props = logicalLines(text).map(parseLine).filter((p): p is Prop => p != null);
  const first = (name: string) => props.find((p) => p.name === name);
  const labels = new Map(
    props.filter((p) => p.name === "X-ABLABEL" && p.group).map((p) => {
      const raw = /^_\$!<(.+)>!\$_$/.exec(p.value)?.[1] ?? p.value;
      return [p.group as string, TYPE_LABELS[raw.toLowerCase()] ?? raw.toLowerCase()];
    }),
  );
  const labelOf = (p: Prop, fallback: string) => (p.group && labels.get(p.group)) || p.types.map((t) => TYPE_LABELS[t]).find(Boolean) || fallback;
  const entries = (name: string, fallback: string): LabelledValue[] =>
    props.filter((p) => p.name === name).flatMap((p) => {
      const value = unescape(p.value).trim();
      return value ? [{ label: labelOf(p, fallback), value }] : [];
    });

  let [family = "", given = ""] = first("N") ? split(first("N")?.value ?? "").map((s) => s.trim()) : [];
  if (!family && !given) {
    const [g = "", ...rest] = unescape(first("FN")?.value ?? "").trim().split(/\s+/);
    given = g;
    family = rest.join(" ");
  }

  const bday = unescape(first("BDAY")?.value ?? "").trim();
  const birthDate = /^\d{4}-?\d{2}-?\d{2}/.test(bday) && !bday.startsWith("--")
    ? `${bday.slice(0, 4)}-${bday.replace(/-/g, "").slice(4, 6)}-${bday.replace(/-/g, "").slice(6, 8)}`
    : null;

  const photoProp = first("PHOTO");
  let photo: ParsedCard["photo"] = null;
  if (photoProp) {
    if (photoProp.value.startsWith("data:")) {
      const [mime, b64] = photoProp.value.slice(5).split(";base64,");
      if (b64 && Object.values(PHOTO_TYPES).includes(mime)) photo = { base64: b64, mimeType: mime };
    } else if (/^(b|base64)$/i.test(photoProp.params.ENCODING ?? "") || photoProp.types.includes("base64")) {
      const type = (photoProp.params.TYPE ?? photoProp.types.find((t) => PHOTO_TYPES[t]) ?? "").toLowerCase();
      if (PHOTO_TYPES[type]) photo = { base64: photoProp.value.trim(), mimeType: PHOTO_TYPES[type] };
    }
  }

  return {
    firstname: given || family,
    lastname: given ? family : "",
    nickname: unescape(first("NICKNAME")?.value ?? "").split(",")[0].trim(),
    company: split(first("ORG")?.value ?? "")[0]?.trim() ?? "",
    jobTitle: unescape(first("TITLE")?.value ?? "").trim(),
    website: unescape(first("URL")?.value ?? "").trim(),
    notes: unescape(first("NOTE")?.value ?? "").trim(),
    birthDate,
    phones: entries("TEL", "mobile"),
    emails: entries("EMAIL", "home"),
    addresses: props.filter((p) => p.name === "ADR").flatMap((p) => {
      const [, , street = "", city = "", state = "", postal = "", country = ""] = split(p.value).map((s) => s.trim());
      return [street, city, postal, country].some(Boolean) ? [{ label: labelOf(p, "home"), street, city, state, postal, country }] : [];
    }),
    photo,
  };
}

// ── is this someone already in the book? ────────────────────────────────────

/** The server's duplicate rule (`ContactApp::VcardImport.phone_key`). */
export function phoneKey(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits || null;
}

type Comparable = { id: number; firstname: string; lastname: string; nickname: string | null; company: string | null; phones: LabelledValue[]; emails: LabelledValue[] };

export function sameContact<C extends Comparable>(incoming: { phones: LabelledValue[]; emails: LabelledValue[] }, book: readonly C[]): C | null {
  const phones = new Set(incoming.phones.map((p) => phoneKey(p.value)).filter(Boolean));
  const emails = new Set(incoming.emails.map((e) => e.value.trim().toLowerCase()).filter(Boolean));
  return (
    book.find((c) => c.phones.some((p) => phones.has(phoneKey(p.value))) || c.emails.some((e) => emails.has(e.value.trim().toLowerCase()))) ?? null
  );
}

/** The existing contact's lists with the new entries added, none twice. */
export function mergeInto(existing: { phones: LabelledValue[]; emails: LabelledValue[] }, incoming: { phones: LabelledValue[]; emails: LabelledValue[] }) {
  const phoneSeen = new Set(existing.phones.map((p) => phoneKey(p.value)));
  const emailSeen = new Set(existing.emails.map((e) => e.value.trim().toLowerCase()));
  return {
    phones: [...existing.phones, ...incoming.phones.filter((p) => !phoneSeen.has(phoneKey(p.value)))],
    emails: [...existing.emails, ...incoming.emails.filter((e) => !emailSeen.has(e.value.trim().toLowerCase()))],
  };
}

