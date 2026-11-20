/**
 * What a relative is to the user, in the app's language.
 *
 * `GET contacts/family_members` sends it as an English word built by the
 * server (`ContactApp::Family#label_for`: LABELS by gender, QUALIFIED as
 * "step-%s", "half-%s", "adoptive %s", "%s-in-law", and "former %s" for a
 * former tie). That is the web's behaviour too, and a French phone would show
 * English. Until the server sends keys (docs/API_ASKS.md §3), the phone reads
 * the word back to a key over the server's whole vocabulary and words it in
 * the current language. A word outside the table (a newer server) is shown as
 * it was sent: an English word is better than none.
 */
export const FAMILY_LABEL_KEYS = ["father", "mother", "parent", "son", "daughter", "child", "husband", "wife", "spouse", "brother", "sister", "sibling", "grandfather", "grandmother", "grandparent", "grandson", "granddaughter", "grandchild", "uncle", "aunt", "uncle_or_aunt", "nephew", "niece", "nephew_or_niece", "cousin", "father_in_law", "mother_in_law", "parent_in_law", "brother_in_law", "sister_in_law", "sibling_in_law", "son_in_law", "daughter_in_law", "child_in_law", "step_father", "step_mother", "step_parent", "step_son", "step_daughter", "step_child", "step_brother", "step_sister", "step_sibling", "half_brother", "half_sister", "half_sibling", "adoptive_father", "adoptive_mother", "adoptive_parent", "adoptive_son", "adoptive_daughter", "adoptive_child", "adoptive_brother", "adoptive_sister", "adoptive_sibling"] as const;

const KNOWN = new Set<string>(FAMILY_LABEL_KEYS);
const keyOf = (word: string) => word.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function familyLabel(label: string | null, t: (key: string, values?: Record<string, unknown>) => string): string | null {
  if (!label) return null;
  const former = /^former\s+/i.test(label);
  const word = former ? label.replace(/^former\s+/i, "") : label;
  const key = keyOf(word);
  if (!KNOWN.has(key)) return label;
  const said = t(`contacts.familyLabels.${key}`);
  return former ? t("contacts.family.former", { word: said }) : said;
}
