/**
 * The A–Z list's order and sections (`docs/design/contacts/SPEC.md` §C.1).
 *
 * The server orders by favourite then last update — no order a person scans —
 * so the phone sorts. A name in a script with no A–Z letter (Arabic, Persian)
 * goes under `#` with digits and symbols, rather than under a wrong letter.
 */
import { displayName, type Contact } from "@/api/contacts";

export const FAVOURITES = "★";
export const OTHERS = "#";

export interface Section {
  key: string;
  data: Contact[];
}

function fold(value: string): string {
  // Ø and Ł do not decompose under NFD; spell them out.
  return value
    .replace(/[Øø]/g, "o")
    .replace(/[Łł]/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** First name, then last name, accent- and case-blind. */
export function sortKey(c: Pick<Contact, "firstname" | "lastname" | "nickname" | "company">): string {
  const first = c.firstname || c.lastname ? `${c.firstname} ${c.lastname}` : displayName(c);
  return fold(first).replace(/\s+/g, " ");
}

export function letterOf(nameOrKey: string): string {
  const first = fold(nameOrKey).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : OTHERS;
}

export function sectionsOf(contacts: readonly Contact[]): Section[] {
  const unique = [...new Map(contacts.map((c) => [c.id, c])).values()];
  const sorted = unique
    .map((c) => ({ c, key: sortKey(c) }))
    .sort((a, b) => a.key.localeCompare(b.key) || a.c.id - b.c.id);

  const byLetter = new Map<string, Contact[]>();
  for (const { c, key } of sorted) {
    const letter = letterOf(key);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), c]);
  }
  const letters = [...byLetter.keys()].filter((k) => k !== OTHERS).sort();
  const sections: Section[] = [];
  const favourites = sorted.filter(({ c }) => c.favorite).map(({ c }) => c);
  if (favourites.length) sections.push({ key: FAVOURITES, data: favourites });
  for (const letter of letters) sections.push({ key: letter, data: byLetter.get(letter) ?? [] });
  if (byLetter.has(OTHERS)) sections.push({ key: OTHERS, data: byLetter.get(OTHERS) ?? [] });
  return sections;
}

/** One or two letters for the avatar, in the name's own script. */
export function initials(c: Pick<Contact, "firstname" | "lastname" | "nickname" | "company">): string {
  const parts = c.firstname || c.lastname ? [c.firstname, c.lastname] : [displayName(c)];
  const letters = parts
    .map((p) => [...p.trim()][0] ?? "")
    .filter(Boolean)
    .map((ch) => ch.toLocaleUpperCase())
    .join("");
  return letters || "?";
}
