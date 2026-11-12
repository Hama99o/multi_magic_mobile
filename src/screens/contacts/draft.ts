/**
 * The contact form's state (`docs/design/contacts/SPEC.md` §C.6).
 *
 * Phones, emails and addresses are lists the server replaces WHOLE on every
 * save (`contact_params`), so the payload always carries every list — an
 * empty one clears it — and never a partial one.
 */
import type { Address, Contact, ContactPayload, LabelledValue } from "@/api/contacts";

export interface Draft {
  firstname: string;
  lastname: string;
  nickname: string;
  company: string;
  jobTitle: string;
  website: string;
  notes: string;
  favorite: boolean;
  birthDate: string | null;
  phones: LabelledValue[];
  emails: LabelledValue[];
  addresses: Address[];
}

type ListKey = "phones" | "emails";

export function emptyAddress(): Address {
  return { label: "home", street: "", city: "", state: "", postal: "", country: "" };
}

export function emptyDraft(): Draft {
  return {
    firstname: "", lastname: "", nickname: "", company: "", jobTitle: "", website: "", notes: "",
    favorite: false, birthDate: null,
    phones: [{ label: "mobile", value: "" }],
    emails: [{ label: "home", value: "" }],
    addresses: [],
  };
}

export function draftFrom(c: Contact): Draft {
  return {
    firstname: c.firstname, lastname: c.lastname, nickname: c.nickname ?? "", company: c.company ?? "",
    jobTitle: c.jobTitle ?? "", website: c.website ?? "", notes: c.notes ?? "", favorite: c.favorite,
    birthDate: c.birthDate,
    phones: c.phones.length ? c.phones.map((p) => ({ ...p })) : [{ label: "mobile", value: "" }],
    emails: c.emails.length ? c.emails.map((e) => ({ ...e })) : [{ label: "home", value: "" }],
    addresses: c.addresses.map((a) => ({ ...a })),
  };
}

/** The next label people usually want: a second phone is home, a second email work. */
const NEXT_LABEL: Record<ListKey, string[]> = { phones: ["mobile", "home", "work", "other"], emails: ["home", "work", "other"] };

export function addEntry(d: Draft, key: ListKey): Draft {
  const used = new Set(d[key].map((e) => e.label));
  const label = NEXT_LABEL[key].find((l) => !used.has(l)) ?? "other";
  return { ...d, [key]: [...d[key], { label, value: "" }] };
}

export function setEntry(d: Draft, key: ListKey, index: number, patch: Partial<LabelledValue>): Draft {
  return { ...d, [key]: d[key].map((e, i) => (i === index ? { ...e, ...patch } : e)) };
}

export function removeEntry(d: Draft, key: ListKey, index: number): Draft {
  return { ...d, [key]: d[key].filter((_, i) => i !== index) };
}

export function setAddress(d: Draft, index: number, patch: Partial<Address>): Draft {
  return { ...d, addresses: d.addresses.map((a, i) => (i === index ? { ...a, ...patch } : a)) };
}

const filled = (list: LabelledValue[]) =>
  list.map((e) => ({ label: e.label, value: e.value.trim() })).filter((e) => e.value);
const addressFilled = (a: Address) => [a.street, a.city, a.postal, a.country, a.state].some((v) => v.trim());

/** What blocks Save: `name`, `email:<row>`, `phone:<row>`. */
export function problems(d: Draft): string[] {
  const out: string[] = [];
  if (!d.firstname.trim() && !d.lastname.trim() && !d.company.trim()) out.push("name");
  d.emails.forEach((e, i) => {
    const v = e.value.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) out.push(`email:${i}`);
  });
  d.phones.forEach((p, i) => {
    const v = p.value.trim();
    if (v && v.replace(/\D/g, "").length < 3) out.push(`phone:${i}`);
  });
  return out;
}

export function toPayload(d: Draft): ContactPayload {
  return {
    firstname: d.firstname.trim(),
    lastname: d.lastname.trim(),
    nickname: d.nickname.trim(),
    company: d.company.trim(),
    job_title: d.jobTitle.trim(),
    website: d.website.trim(),
    notes: d.notes.trim(),
    favorite: d.favorite,
    birth_date: d.birthDate,
    phones: filled(d.phones),
    emails: filled(d.emails),
    addresses: d.addresses
      .filter(addressFilled)
      .map((a) => ({ label: a.label, street: a.street.trim(), city: a.city.trim(), state: a.state.trim(), postal: a.postal.trim(), country: a.country.trim() })),
  };
}

/** A change worth asking about on Cancel — empty rows are not one. */
export function isDirty(d: Draft, initial: Draft): boolean {
  return JSON.stringify(toPayload(d)) !== JSON.stringify(toPayload(initial));
}
