/**
 * Add and edit a SafeZone item, as the web's drawers do it (owner,
 * 2026-11-15: "everything doable on mobile, finish 100%"). Read off
 * multi_magic's PasswordDrawer / PaymentCardDrawer / IdentityDrawer and the
 * controllers' permitted params:
 *   password      title*  username  email  password (+ generator)  link  note
 *   payment_card  name*   card_type (credit|debit)  card_number (19)  cvv (4)
 *                 expiry_date ("MM/YY")  code (billing code)  note
 *   identity      type (5)  document_number*  issued_at  expires_at  note
 * Pure: the screen holds the values in its own state, never in a cache.
 */
import * as Crypto from "expo-crypto";
import type { SafeZoneItem, SafeZoneKind } from "@/api/safezone";

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, "required" | "email" | "date">;

export interface FormField {
  key: string;
  required?: boolean;
  secret?: boolean;
  multiline?: boolean;
  maxLength?: number;
  keyboard?: "default" | "email-address" | "number-pad" | "url";
  /** A choice among the server's values (rendered as chips). */
  options?: readonly string[];
  /** YYYY-MM-DD (the web's <input type="date">), picked on the Calendar's date wheels. */
  date?: boolean;
  /** How far ahead the wheels' years go: an expiry is in the future, an issue date is not. */
  futureYears?: number;
  mono?: boolean;
}

export const CARD_TYPES = ["credit_card", "debit_card"] as const;
export const IDENTITY_TYPES = ["passport", "national_id", "drivers_license", "residence_permit", "other"] as const;

export const FORM_FIELDS: Record<SafeZoneKind, readonly FormField[]> = {
  passwords: [
    { key: "title", required: true },
    { key: "username" },
    { key: "email", keyboard: "email-address" },
    { key: "password", secret: true, mono: true },
    { key: "link", keyboard: "url" },
    { key: "note", multiline: true },
  ],
  payment_cards: [
    { key: "name", required: true },
    { key: "card_type", options: CARD_TYPES },
    { key: "card_number", maxLength: 19, keyboard: "number-pad", secret: true, mono: true },
    { key: "cvv", maxLength: 4, keyboard: "number-pad", secret: true, mono: true },
    { key: "expiry_date" },
    { key: "code", secret: true },
    { key: "note", multiline: true },
  ],
  identities: [
    { key: "type", options: IDENTITY_TYPES },
    { key: "document_number", required: true, secret: true, mono: true },
    { key: "issued_at", date: true },
    { key: "expires_at", date: true, futureYears: 30 },
    { key: "note", multiline: true },
  ],
};

/** The server's root key for create/update (`params.require(:…)`). */
export const PAYLOAD_ROOT: Record<SafeZoneKind, string> = { passwords: "password", payment_cards: "payment_card", identities: "identity" };
const TITLE_KEY: Record<SafeZoneKind, string> = { passwords: "title", payment_cards: "name", identities: "type" };

export function emptyForm(kind: SafeZoneKind): FormValues {
  const values: FormValues = {};
  for (const f of FORM_FIELDS[kind]) values[f.key] = f.options ? f.options[0] : "";
  return values;
}

export function formFromItem(item: SafeZoneItem): FormValues {
  const values = emptyForm(item.kind);
  if (item.title) values[TITLE_KEY[item.kind]] = item.title;
  for (const field of item.fields) if (field.key in values) values[field.key] = field.value;
  return values;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function validateForm(kind: SafeZoneKind, values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const f of FORM_FIELDS[kind]) {
    const v = (values[f.key] ?? "").trim();
    if (f.required && !v) errors[f.key] = "required";
    else if (v && f.keyboard === "email-address" && !EMAIL.test(v)) errors[f.key] = "email";
    else if (v && f.date && !isRealDate(v)) errors[f.key] = "date";
  }
  return errors;
}

/** `{ password: {...} }`: only the permitted keys, trimmed (a secret keeps its inner spaces). */
export function toPayload(kind: SafeZoneKind, values: FormValues): Record<string, Record<string, string>> {
  const body: Record<string, string> = {};
  for (const f of FORM_FIELDS[kind]) body[f.key] = (values[f.key] ?? "").trim();
  return { [PAYLOAD_ROOT[kind]]: body };
}

// The web's generator (PasswordDrawer.tsx): ambiguous glyphs (0/O, 1/l/I) left
// out; one character from each class so it always clears the "Strong" bar
// (>= 12 chars, 3+ classes); then shuffled.
const GEN_LENGTH = 20;
const GEN_SETS = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*()-_=+"];

const cryptoInt = (max: number): number => {
  const b = Crypto.getRandomBytes(4);
  return (((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0) % max;
};

export function generatePassword(rand: (max: number) => number = cryptoInt, length = GEN_LENGTH): string {
  const pick = (max: number) => Math.abs(rand(max)) % max;
  const all = GEN_SETS.join("");
  const chars = GEN_SETS.map((set) => set[pick(set.length)]);
  while (chars.length < length) chars.push(all[pick(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
