/**
 * The words for a family tie (audit #25).
 *
 * What the server stores is an atomic tie (parent, child, spouse, sibling…), a
 * qualifier (step, half, adoptive) and the relative's gender; a person says
 * "half-sister". `ROLES` is the web's table between the two
 * (`pages/contacts/familyRoles.ts`, 6de97a32), used wherever a tie is picked
 * or changed. `relationWord` is the server's `label_for` in the app's own
 * language: the serializer's `label` is English only, so it is the fallback,
 * not the word.
 */
import type { Gender, Qualifier, Relation, RelationKind } from "@/api/contacts";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface Role {
  key: string;
  kind: RelationKind;
  /** null: the neutral word, for someone who is neither or not known. */
  gender: Gender | null;
}

export const FAMILY_ROLES: readonly Role[] = [
  { key: "father", kind: "parent", gender: "male" },
  { key: "mother", kind: "parent", gender: "female" },
  { key: "husband", kind: "spouse", gender: "male" },
  { key: "wife", kind: "spouse", gender: "female" },
  { key: "son", kind: "child", gender: "male" },
  { key: "daughter", kind: "child", gender: "female" },
  { key: "brother", kind: "sibling", gender: "male" },
  { key: "sister", kind: "sibling", gender: "female" },
  { key: "partner", kind: "spouse", gender: null },
];
export const NEUTRAL_ROLES: readonly Role[] = [
  { key: "parent", kind: "parent", gender: null },
  { key: "child", kind: "child", gender: null },
  { key: "sibling", kind: "sibling", gender: null },
];
export const OTHER_ROLES: readonly Role[] = [
  { key: "friend", kind: "friend", gender: null },
  { key: "colleague", kind: "colleague", gender: null },
  { key: "neighbour", kind: "neighbour", gender: null },
];
export const ALL_ROLES: readonly Role[] = [...FAMILY_ROLES, ...NEUTRAL_ROLES, ...OTHER_ROLES];
/** The other family, reached through a spouse: their parents and siblings. */
export const IN_LAW_ROLES: readonly Role[] = FAMILY_ROLES.filter((r) => ["father", "mother", "brother", "sister"].includes(r.key));

const FAMILY_KINDS: readonly RelationKind[] = ["parent", "child", "spouse", "sibling"];

/**
 * The qualifiers a person can choose for a tie (web `QUALIFIERS` on
 * `QUALIFIABLE` kinds). The web offers "half" on a parent or a child too; a
 * half-father is not a thing, so here it is a sibling's only.
 */
export function qualifiersFor(kind: RelationKind): Qualifier[] {
  if (kind === "sibling") return ["biological", "step", "half", "adoptive"];
  if (kind === "parent" || kind === "child") return ["biological", "step", "adoptive"];
  return [];
}

/** The role a stored tie reads as, given the relative's gender (web `roleFor`). */
export function roleFor(kind: RelationKind, gender: Gender): Role | undefined {
  return ALL_ROLES.find((r) => r.kind === kind && r.gender === gender) ?? ALL_ROLES.find((r) => r.kind === kind && r.gender === null);
}

function word(t: Translate, kind: RelationKind, qualifier: Qualifier, gender: Gender | null): string | null {
  if (!FAMILY_KINDS.includes(kind)) return t(`contacts.family.kinds.${kind}`);
  const allowed = kind === "spouse" ? ["biological"] : qualifiersFor(kind);
  if (!allowed.includes(qualifier)) return null;
  const g = gender === "male" || gender === "female" ? gender : "neutral";
  return t(`contacts.family.words.${kind}.${qualifier}.${g}`);
}

export function roleLabel(t: Translate, role: Role): string {
  return word(t, role.kind, "biological", role.gender) ?? role.key;
}

/** "half-sister", "former wife": the tie in the app's language. */
export function relationWord(t: Translate, r: Relation): string {
  const w = word(t, r.kind, r.qualifier, r.relative.gender) ?? r.label;
  return r.status === "former" ? t("contacts.family.former", { word: w }) : w;
}

/** The web's `GROUP_ORDER`: the way a person thinks about their family. */
const GROUP_ORDER: readonly RelationKind[] = ["parent", "spouse", "sibling", "child", "friend", "colleague", "neighbour", "other"];

export function groupRelations(relations: readonly Relation[]): Relation[] {
  return GROUP_ORDER.flatMap((kind) => relations.filter((r) => r.kind === kind));
}
