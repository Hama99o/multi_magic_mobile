/**
 * Phone numbers: what the dialer gets, and what WhatsApp gets
 * (`docs/design/contacts/SPEC.md` §C.4).
 *
 * The dialer takes the number as the person wrote it (a national 07xx works
 * from a phone in that country), so `dialable` only strips the punctuation.
 *
 * WhatsApp needs INTERNATIONAL digits — `wa.me/93701234567`, no plus, no
 * trunk 0 — and a national number cannot become one without a country. So
 * `whatsappNumber` takes the contact's country (from their address) and then
 * the user's default, and returns null rather than guess: opening a chat with
 * +33 when the person is in Kabul writes to a stranger.
 */
import type { Address } from "@/api/contacts";

export type CountryCode = string;

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: CountryCode;
  /** The calling code, digits only. */
  dial: string;
  /** What a national number starts with and the international form drops.
   *  "" when there is none (North America dials 1 inside the code) and
   *  "keep" where the 0 is part of the number (Italy). */
  trunk: "0" | "8" | "" | "keep";
  name: { en: string; fr: string };
}

/** The countries the owner's people are in first, then the common ones. */
export const COUNTRIES: readonly Country[] = [
  { code: "AF", dial: "93", trunk: "0", name: { en: "Afghanistan", fr: "Afghanistan" } },
  { code: "FR", dial: "33", trunk: "0", name: { en: "France", fr: "France" } },
  { code: "PK", dial: "92", trunk: "0", name: { en: "Pakistan", fr: "Pakistan" } },
  { code: "IR", dial: "98", trunk: "0", name: { en: "Iran", fr: "Iran" } },
  { code: "DE", dial: "49", trunk: "0", name: { en: "Germany", fr: "Allemagne" } },
  { code: "GB", dial: "44", trunk: "0", name: { en: "United Kingdom", fr: "Royaume-Uni" } },
  { code: "BE", dial: "32", trunk: "0", name: { en: "Belgium", fr: "Belgique" } },
  { code: "CH", dial: "41", trunk: "0", name: { en: "Switzerland", fr: "Suisse" } },
  { code: "NL", dial: "31", trunk: "0", name: { en: "Netherlands", fr: "Pays-Bas" } },
  { code: "ES", dial: "34", trunk: "", name: { en: "Spain", fr: "Espagne" } },
  { code: "IT", dial: "39", trunk: "keep", name: { en: "Italy", fr: "Italie" } },
  { code: "PT", dial: "351", trunk: "", name: { en: "Portugal", fr: "Portugal" } },
  { code: "AT", dial: "43", trunk: "0", name: { en: "Austria", fr: "Autriche" } },
  { code: "SE", dial: "46", trunk: "0", name: { en: "Sweden", fr: "Suède" } },
  { code: "NO", dial: "47", trunk: "", name: { en: "Norway", fr: "Norvège" } },
  { code: "DK", dial: "45", trunk: "", name: { en: "Denmark", fr: "Danemark" } },
  { code: "IE", dial: "353", trunk: "0", name: { en: "Ireland", fr: "Irlande" } },
  { code: "US", dial: "1", trunk: "", name: { en: "United States", fr: "États-Unis" } },
  { code: "CA", dial: "1", trunk: "", name: { en: "Canada", fr: "Canada" } },
  { code: "TR", dial: "90", trunk: "0", name: { en: "Turkey", fr: "Turquie" } },
  { code: "AE", dial: "971", trunk: "0", name: { en: "United Arab Emirates", fr: "Émirats arabes unis" } },
  { code: "SA", dial: "966", trunk: "0", name: { en: "Saudi Arabia", fr: "Arabie saoudite" } },
  { code: "QA", dial: "974", trunk: "", name: { en: "Qatar", fr: "Qatar" } },
  { code: "IN", dial: "91", trunk: "0", name: { en: "India", fr: "Inde" } },
  { code: "TJ", dial: "992", trunk: "0", name: { en: "Tajikistan", fr: "Tadjikistan" } },
  { code: "UZ", dial: "998", trunk: "", name: { en: "Uzbekistan", fr: "Ouzbékistan" } },
  { code: "TM", dial: "993", trunk: "8", name: { en: "Turkmenistan", fr: "Turkménistan" } },
  { code: "RU", dial: "7", trunk: "8", name: { en: "Russia", fr: "Russie" } },
  { code: "MA", dial: "212", trunk: "0", name: { en: "Morocco", fr: "Maroc" } },
  { code: "DZ", dial: "213", trunk: "0", name: { en: "Algeria", fr: "Algérie" } },
  { code: "TN", dial: "216", trunk: "", name: { en: "Tunisia", fr: "Tunisie" } },
  { code: "AU", dial: "61", trunk: "0", name: { en: "Australia", fr: "Australie" } },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code: CountryCode | null | undefined): Country | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** The country an address names, in English, French or as its code. */
export function countryFromAddress(addresses: readonly Address[]): CountryCode | null {
  for (const a of addresses) {
    const name = fold(a.country);
    if (!name) continue;
    const hit = COUNTRIES.find(
      (c) => fold(c.name.en) === name || fold(c.name.fr) === name || c.code.toLowerCase() === name,
    );
    if (hit) return hit.code;
  }
  return null;
}

/** `fr-FR` → FR, when we know FR. A bare language says nothing about a place. */
export function countryFromLocale(locale: string | null | undefined): CountryCode | null {
  const region = (locale ?? "").split(/[-_]/)[1];
  return region && /^[A-Za-z]{2}$/.test(region) ? (countryByCode(region)?.code ?? null) : null;
}

/** Cut an extension ("ext. 12", "x12", "poste 12", ";12", ",12"). */
function withoutExtension(raw: string): string {
  return raw.replace(/\s*(?:ext\.?|extension|poste|x|;|,)\s*\d+\s*$/i, "");
}

/** What the dialer gets: the plus, the digits, and `*` / `#` for service codes. */
export function dialable(raw: string): string {
  const kept = withoutExtension(raw).replace(/\(0\)/, "").replace(/[^\d+*#]/g, "");
  return kept.startsWith("+") ? `+${kept.slice(1).replace(/\+/g, "")}` : kept.replace(/\+/g, "");
}

export function telUrl(raw: string): string {
  return `tel:${dialable(raw)}`;
}

export function smsUrl(raw: string): string {
  return `sms:${dialable(raw)}`;
}

const valid = (digits: string) => (digits.length >= 8 && digits.length <= 15 ? digits : null);

/**
 * International digits for WhatsApp, or null when that cannot be known.
 * `contactCountry` (from their address) wins over `defaultCountry`.
 */
export function whatsappNumber(
  raw: string,
  { contactCountry, defaultCountry }: { contactCountry?: CountryCode | null; defaultCountry?: CountryCode | null },
): string | null {
  const cleaned = withoutExtension(raw ?? "").trim();
  if (cleaned.startsWith("+")) return valid(cleaned.replace(/\(0\)/, "").replace(/\D/g, ""));

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6) return null;
  if (digits.startsWith("00")) return valid(digits.slice(2));

  const country = countryByCode(contactCountry) ?? countryByCode(defaultCountry);
  if (country && country.trunk !== "" && country.trunk !== "keep" && digits.startsWith(country.trunk)) {
    return valid(country.dial + digits.slice(country.trunk.length));
  }
  if (country?.trunk === "keep" && digits.startsWith("0")) return valid(country.dial + digits);
  // No trunk prefix: either already international ("33612345678"), or a
  // national number written without its 0 ("701234567").
  if (digits.length >= 11 && !digits.startsWith("0")) return valid(digits);
  if (!country || digits.startsWith("0")) return null;
  return valid(country.dial + digits);
}
