/**
 * `family_members` sends what each person is to the user as an ENGLISH word
 * (`ContactApp::Family::LABELS`, `QUALIFIED`, and "former …"). Until the
 * server sends keys (docs/API_ASKS.md §3), the phone words it in the app's
 * language from the server's own vocabulary; a word it does not know is shown
 * as sent, never dropped.
 */
import i18n from "@/i18n";
import { familyLabel, FAMILY_LABEL_KEYS } from "../familyLabel";

const t = i18n.t.bind(i18n);

describe("familyLabel", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("in English, reads as the web does", async () => {
    await i18n.changeLanguage("en");
    expect(familyLabel("mother", t)).toBe("mother");
    expect(familyLabel("step-father", t)).toBe("step-father");
    expect(familyLabel("uncle or aunt", t)).toBe("uncle or aunt");
  });

  it("in French, every word the server can send is French", async () => {
    await i18n.changeLanguage("fr");
    expect(familyLabel("mother", t)).toBe("mère");
    expect(familyLabel("father-in-law", t)).toBe("beau-père");
    expect(familyLabel("half-sister", t)).toBe("demi-sœur");
    expect(familyLabel("adoptive son", t)).toBe("fils adoptif");
    expect(familyLabel("former wife", t)).toBe("ex-épouse");
    // Every word in the table resolves in French (locales.test checks none is left identical to the English).
    for (const key of FAMILY_LABEL_KEYS) expect(i18n.exists(`contacts.familyLabels.${key}`, { lng: "fr" })).toBe(true);
  });

  it("a word it does not know is shown as sent", async () => {
    await i18n.changeLanguage("fr");
    expect(familyLabel("great-great-aunt", t)).toBe("great-great-aunt");
    expect(familyLabel(null, t)).toBeNull();
  });
});
