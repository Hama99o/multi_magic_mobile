/**
 * The phone's own address book — the only file that touches `expo-contacts`
 * (`docs/design/contacts/SPEC.md` §C.7–8).
 *
 * - Permission is asked HERE, when the person taps Import or Save, never at
 *   launch. The answer is one of three words the screen can say something
 *   about: `all`, `limited` (iOS 18: only the contacts they shared), `denied`.
 * - The module is required with a literal inside a `try` (`readAloud.store.ts`
 *   explains why): a binary built before expo-contacts was added has no
 *   native side, and must show "update the app", not lose the route.
 */
import { Platform } from "react-native";
import type { PhoneContact } from "./vcard";

type Access = "all" | "limited" | "denied";

interface ContactsModule {
  Contact: {
    presentPicker: () => Promise<{ id: string; getDetails: (fields?: readonly string[]) => Promise<Record<string, unknown>> } | null>;
    getAllDetails: (fields: readonly string[]) => Promise<Record<string, unknown>[]>;
    presentCreateForm: (contact?: Record<string, unknown>) => Promise<boolean>;
    presentAccessPicker?: () => Promise<unknown[]>;
  };
  requestPermissionsAsync: () => Promise<{ granted: boolean; accessPrivileges?: "all" | "limited" | "none"; canAskAgain?: boolean }>;
}

let native: ContactsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  native = require("expo-contacts") as ContactsModule;
} catch {
  native = null;
}

/** What `toVcard` reads — per platform. Android's native `ContactField` has
 *  no "birthday" (the TypeScript types do): asking for it rejected the whole
 *  read on a device, 2026-11-12. On Android a birthday is a date labelled
 *  "birthday" (`EventLabelMapper.kt`), so Android asks for "dates". */
const COMMON = [
  "givenName", "middleName", "familyName", "nickname", "company", "jobTitle", "note",
  "phones", "emails", "addresses", "urlAddresses",
] as const;

export function fieldsFor(os: string): readonly string[] {
  return os === "android" ? [...COMMON, "dates"] : [...COMMON, "birthday"];
}

type ContactDate = { year?: number; month: number; day: number };

export function birthdayFromDates(dates: unknown): ContactDate | null {
  if (!Array.isArray(dates)) return null;
  const hit = dates.find((d) => /birthday/i.test(String((d as { label?: unknown })?.label ?? "")));
  const date = (hit as { date?: ContactDate } | undefined)?.date;
  return date && date.month && date.day ? date : null;
}

export class PhoneBookUnavailable extends Error {
  constructor() {
    super("expo-contacts is not in this build");
    this.name = "PhoneBookUnavailable";
  }
}

function need(): ContactsModule {
  if (!native?.Contact) throw new PhoneBookUnavailable();
  return native;
}

function asPhoneContact(raw: Record<string, unknown>, fallbackId: string): PhoneContact {
  const id = typeof raw.id === "string" && raw.id ? raw.id : fallbackId;
  const birthday = (raw.birthday as ContactDate | null | undefined) ?? birthdayFromDates(raw.dates);
  return { ...(raw as Omit<PhoneContact, "id">), id, ...(birthday ? { birthday } : {}) };
}

export const phoneBook = {
  available: () => Boolean(native?.Contact),

  requestAccess: async (): Promise<Access> => {
    try {
      const answer = await need().requestPermissionsAsync();
      if (!answer.granted) return "denied";
      return answer.accessPrivileges === "limited" ? "limited" : "all";
    } catch {
      return "denied";
    }
  },

  /** iOS 18 limited access: let the person share more contacts. */
  shareMore: async (): Promise<void> => {
    await need().Contact.presentAccessPicker?.();
  },

  /** The system contact picker: one contact, no permission needed on iOS. */
  pickOne: async (): Promise<PhoneContact | null> => {
    const picked = await need().Contact.presentPicker();
    if (!picked) return null;
    const details = await picked.getDetails(fieldsFor(Platform.OS));
    return asPhoneContact({ ...details, id: picked.id }, picked.id);
  },

  readAll: async (): Promise<PhoneContact[]> => {
    const rows = await need().Contact.getAllDetails(fieldsFor(Platform.OS));
    return rows.map((row, i) => asPhoneContact(row, `phone-${i}`));
  },

  /** The system's own "new contact" form, pre-filled: the person confirms there. */
  saveToPhone: async (c: {
    firstname: string;
    lastname: string;
    company: string | null;
    jobTitle: string | null;
    notes: string | null;
    phones: { label: string; value: string }[];
    emails: { label: string; value: string }[];
  }): Promise<boolean> => {
    const record: Record<string, unknown> = {
      givenName: c.firstname,
      familyName: c.lastname,
      phones: c.phones.map((p) => ({ label: p.label, number: p.value })),
      emails: c.emails.map((e) => ({ label: e.label, address: e.value })),
    };
    if (c.company) record.company = c.company;
    if (c.jobTitle) record.jobTitle = c.jobTitle;
    if (c.notes) record.note = c.notes;
    return need().Contact.presentCreateForm(record);
  },
};
