/**
 * Phone numbers as the owner's contacts actually hold them (supervisor's
 * list, 2026-11-12): 07xx (Afghanistan), +93, 0093, 06xx (France), with
 * spaces, dashes, dots and brackets — and what WhatsApp needs: international
 * digits, no plus, no trunk 0.
 */
import { countryFromAddress, countryFromLocale, dialable, telUrl, whatsappNumber, COUNTRIES } from "../phone";

describe("whatsappNumber", () => {
  const af = { defaultCountry: "AF" as const };
  const fr = { defaultCountry: "FR" as const };

  it.each([
    ["+93 70 123 4567", af, "93701234567"],
    ["0093 70 123 4567", af, "93701234567"],
    ["0701234567", af, "93701234567"],
    ["070-123-4567", af, "93701234567"],
    ["(070) 123.4567", af, "93701234567"],
    ["06 12 34 56 78", fr, "33612345678"],
    ["06-12-34-56-78", fr, "33612345678"],
    ["+33 (0)6 12 34 56 78", fr, "33612345678"],
    ["+33 6 12 34 56 78", af, "33612345678"],
    ["0033612345678", af, "33612345678"],
  ])("%s with %o → %s", (raw, opts, expected) => {
    expect(whatsappNumber(raw, opts)).toBe(expected);
  });

  it("takes the CONTACT's country before the default one", () => {
    expect(whatsappNumber("0612345678", { contactCountry: "FR", defaultCountry: "AF" })).toBe("33612345678");
  });

  it("returns null for a national number when no country is known — never a guess", () => {
    expect(whatsappNumber("0612345678", {})).toBeNull();
  });

  it("keeps a number already written in international digits without a plus", () => {
    expect(whatsappNumber("33612345678", {})).toBe("33612345678");
  });

  it("refuses what is not a phone number", () => {
    expect(whatsappNumber("", af)).toBeNull();
    expect(whatsappNumber("abc", af)).toBeNull();
    expect(whatsappNumber("12", af)).toBeNull();
  });

  it("keeps Italy's leading 0, which is part of the number there, not a trunk prefix", () => {
    expect(whatsappNumber("06 1234 5678", { defaultCountry: "IT" })).toBe("390612345678");
  });

  it("adds the code to a national number written without its trunk 0", () => {
    expect(whatsappNumber("701234567", af)).toBe("93701234567");
  });

  it("drops the extension", () => {
    expect(whatsappNumber("+33 1 23 45 67 89 ext. 12", af)).toBe("33123456789");
  });
});

describe("dialable / telUrl", () => {
  it("keeps the plus and the digits only, so the dialer gets what the person wrote", () => {
    expect(dialable("+33 (0)6 12-34.56 78")).toBe("+33612345678");
    expect(dialable("070 123 4567")).toBe("0701234567");
    expect(telUrl("070 123 4567")).toBe("tel:0701234567");
  });

  it("keeps * and # for service codes", () => {
    expect(dialable("*#06#")).toBe("*#06#");
  });
});

describe("countryFromAddress", () => {
  it.each([
    ["Afghanistan", "AF"],
    ["afghanistan ", "AF"],
    ["France", "FR"],
    ["Allemagne", "DE"],
    ["Royaume-Uni", "GB"],
    ["FR", "FR"],
    ["Pakistan", "PK"],
  ])("%s → %s", (name, code) => {
    expect(countryFromAddress([{ label: "home", street: "", city: "", state: "", postal: "", country: name }])).toBe(code);
  });

  it("returns null for an unknown or missing country", () => {
    expect(countryFromAddress([{ label: "home", street: "", city: "", state: "", postal: "", country: "Atlantis" }])).toBeNull();
    expect(countryFromAddress([])).toBeNull();
  });
});

describe("countryFromLocale", () => {
  it.each([
    ["fr-FR", "FR"],
    ["en-US", "US"],
    ["ps-AF", "AF"],
    ["fa_AF", "AF"],
    ["en", null],
    ["en-ZZ", null],
  ])("%s → %s", (locale, code) => {
    expect(countryFromLocale(locale)).toBe(code);
  });
});

describe("COUNTRIES", () => {
  it("has a unique code per country and a calling code of digits", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) expect(c.dial).toMatch(/^\d{1,4}$/);
  });

  it("names every country in English and French", () => {
    for (const c of COUNTRIES) {
      expect(c.name.en.length).toBeGreaterThan(1);
      expect(c.name.fr.length).toBeGreaterThan(1);
    }
  });
});
