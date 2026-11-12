/**
 * The phone's own contacts → vCard 3.0 text for `import_vcard`
 * (`docs/design/contacts/SPEC.md` §C.7).
 *
 * The server owns what a duplicate is and how a card becomes a contact
 * (`ContactApp::VcardReader` / `VcardImport`, multi_magic 485e2db1), so the
 * phone writes plain, standard cards and nothing else: one import path for a
 * .vcf file and for the address book, tested once on the server.
 *
 * Photos are NOT sent in bulk: an address book of 300 with photos is tens of
 * megabytes over a phone connection for something the person did not ask
 * for. A photo can be added on the contact afterwards.
 */

/** The fields read from `expo-contacts` (`ContactDetails`), all optional. */
export interface PhoneContact {
  id: string;
  givenName?: string | null;
  familyName?: string | null;
  middleName?: string | null;
  nickname?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  note?: string | null;
  birthday?: { year?: number; month: number; day: number } | null;
  phones?: { label?: string; number?: string }[];
  emails?: { label?: string; address?: string }[];
  addresses?: {
    label?: string;
    street?: string;
    city?: string;
    region?: string;
    state?: string;
    postcode?: string;
    country?: string;
  }[];
  urlAddresses?: { url?: string }[];
}

/** Our labels → the vCard TYPE the server maps back (`TYPE_LABELS`). */
const TYPES: Record<string, string> = {
  mobile: "CELL",
  cell: "CELL",
  iphone: "CELL",
  home: "HOME",
  work: "WORK",
  main: "MAIN",
  other: "OTHER",
};

/** RFC 6350 §3.4: backslash, comma, semicolon and newline are escaped. */
function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

const t = (v: string | null | undefined) => (v ?? "").trim();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function displayOf(c: PhoneContact): string {
  return [t(c.givenName), t(c.middleName), t(c.familyName)].filter(Boolean).join(" ") || t(c.nickname) || t(c.company);
}

export function recognisable(c: PhoneContact): boolean {
  return Boolean(
    displayOf(c) || (c.phones ?? []).some((p) => t(p.number)) || (c.emails ?? []).some((e) => t(e.address)),
  );
}

export function toVcard(c: PhoneContact): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  let group = 0;
  /** A known label is a TYPE; any other keeps its words via iOS item grouping. */
  const labelled = (prop: string, label: string | undefined, value: string) => {
    const key = t(label).toLowerCase();
    if (!key) return lines.push(`${prop}:${value}`);
    if (TYPES[key]) return lines.push(`${prop};TYPE=${TYPES[key]}:${value}`);
    group += 1;
    lines.push(`item${group}.${prop}:${value}`, `item${group}.X-ABLabel:${esc(t(label))}`);
  };

  const given = [t(c.givenName), t(c.middleName)].filter(Boolean).join(" ");
  lines.push(`N:${esc(t(c.familyName))};${esc(given)};;;`);
  lines.push(`FN:${esc(displayOf(c) || t(c.phones?.[0]?.number) || t(c.emails?.[0]?.address))}`);
  if (t(c.nickname)) lines.push(`NICKNAME:${esc(t(c.nickname))}`);
  if (t(c.company)) lines.push(`ORG:${esc(t(c.company))}`);
  if (t(c.jobTitle)) lines.push(`TITLE:${esc(t(c.jobTitle))}`);

  for (const p of c.phones ?? []) if (t(p.number)) labelled("TEL", p.label, esc(t(p.number)));
  for (const e of c.emails ?? []) if (t(e.address)) labelled("EMAIL", e.label, esc(t(e.address)));
  for (const a of c.addresses ?? []) {
    const parts = [t(a.street), t(a.city), t(a.region) || t(a.state), t(a.postcode), t(a.country)];
    if (parts.some(Boolean)) labelled("ADR", a.label, `;;${parts.map(esc).join(";")}`);
  }
  const url = (c.urlAddresses ?? []).map((u) => t(u.url)).find(Boolean);
  if (url) lines.push(`URL:${esc(url)}`);
  const b = c.birthday;
  if (b?.year && b.month && b.day) lines.push(`BDAY:${b.year}-${pad(b.month)}-${pad(b.day)}`);
  if (t(c.note)) lines.push(`NOTE:${esc(t(c.note))}`);

  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

export function toVcards(contacts: readonly PhoneContact[]): string[] {
  return contacts.filter(recognisable).map(toVcard);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
