/**
 * What a SafeZone row and field look like as text. Pure, so the masking is
 * tested without a renderer.
 */
import type { SafeZoneItem, SafeZoneRow } from "@/api/safezone";
import { CARD_TYPES, IDENTITY_TYPES } from "./forms";

export const MASK = "••••••••";

export function maskedTail(last4: string | null): string {
  return last4 ? `•••• ${last4}` : MASK;
}

/** True when an identity's expiry date is before today (local date). */
export function isExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return expiresAt.slice(0, 10) < today;
}

/** The second line of a list row: never a secret, at most its last four. */
export function rowSubtitle(row: SafeZoneRow): string {
  if (row.kind === "passwords") return row.username || row.email || row.link || "";
  return maskedTail(row.last4);
}

/**
 * A choice's words: the server's enum, translated; a value this phone does not
 * know (a newer server) as it is, and nothing as "" — never a raw i18n key
 * (audit 2026-11-16: an identity with no type showed `safezone.identityTypes.`).
 */
export function choiceLabel(key: "card_type" | "type", value: string | null, t: (key: string) => string): string {
  if (!value) return "";
  if (key === "card_type") return (CARD_TYPES as readonly string[]).includes(value) ? t(`safezone.cardTypes.${value}`) : value;
  return (IDENTITY_TYPES as readonly string[]).includes(value) ? t(`safezone.identityTypes.${value}`) : value;
}

/** A site address the browser can open. */
export function siteUrl(link: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`;
}

/** The item as a screen keeps it: every secret value blanked (SECURITY.md §0). */
export function withoutSecrets(item: SafeZoneItem): SafeZoneItem {
  return { ...item, fields: item.fields.map((f) => (f.secret ? { ...f, value: "" } : f)) };
}

/** "https://www.bank.example/login" → "B". The web's `siteInitial`: a mark for
 *  a saved site that costs no request (a vault must not ask a third party for
 *  icons: that would tell it which sites the person has). */
export function siteInitial(link: string): string {
  const raw = link.trim();
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    return (host.charAt(0) || raw.charAt(0) || "?").toUpperCase();
  } catch {
    return (raw.charAt(0) || "?").toUpperCase();
  }
}

/** A stable number for a text (a site's host), so its tile keeps one colour. */
export function stableHash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
