/**
 * The instant answer while the server's search runs (`app/contacts/index.tsx`)
 * and the "add to which contact?" filter (`app/contacts/shared.tsx`): names,
 * company, numbers by their digits, emails.
 */
import type { Contact } from "@/api/contacts";
import { sortKey } from "./sections";

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The instant answer while the server's search runs: names, and numbers by digits. */
export function localMatch(contact: Contact, term: string): boolean {
  const q = fold(term.trim());
  if (!q) return true;
  if (sortKey(contact).includes(q) || fold(contact.company ?? "").includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3 && contact.phones.some((p) => p.value.replace(/\D/g, "").includes(digits))) return true;
  return contact.emails.some((e) => e.value.toLowerCase().includes(q));
}

