/**
 * THE PERSONAL LAYER over a shared view (SPEC C1).
 *
 * The owner, 2026-11-20: a filter changed on the phone stays personal; it does
 * NOT change the shared view for others. Hello: the whole layer (filter, sort,
 * search, group, hidden fields, card lines). So a view's saved config is read,
 * never written, and what the person changes lives here, on the device, under
 * their user id and the view's id. The server needs no change for it:
 * `records#index` takes the query as parameters (`src/api/tables.ts`).
 *
 * Every key is optional: absent means "as the shared view says".
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FieldDefinition } from "@/api/fields";
import type { FilterCondition, RecordsQuery, SortRule, View } from "@/api/tables";
import { isComplete } from "./filters";

export interface PersonalLayer {
  search?: string;
  filters?: FilterCondition[];
  match?: "and" | "or";
  sorts?: SortRule[];
  groupBy?: number | null;
  hiddenFieldIds?: number[];
  /**
   * The order of the fields (the owner, 2026-11-20: personal like the rest;
   * the web's own order is the SHARED view's, `field_order`).
   */
  fieldOrder?: number[];
  /** The fields a card shows under its title, in order (Airtable's "Customize cards"). */
  cardFieldIds?: number[];
  /** Colour the cards by this single select (the view's `row_color_field_id`); null for none. */
  rowColorFieldId?: number | null;
  /** Newest first by the row's own creation time (C3). Absent: on for a view with no sort. */
  newestFirst?: boolean;
  /**
   * Kanban columns folded away, by column key (4b). Kept on the device like the rest, but NOT a
   * difference from the shared view: a fold changes what is drawn, never which rows or how they read.
   */
  foldedColumns?: string[];
}

/** At most this many fields under a card's title (SPEC C2). */
export const CARD_FIELDS = 3;

const sortsOf = (view: View, layer: PersonalLayer) => layer.sorts ?? view.config.sorts;

/** The query the phone sends: the shared view, with the person's choices over it. */
export function effectiveQuery(view: View, layer: PersonalLayer): Required<Omit<RecordsQuery, "groupBy" | "fieldIds">> & { groupBy: number | null } {
  const sorts = sortsOf(view, layer);
  return {
    search: layer.search ?? view.config.search,
    // A condition still being filled in waits; the web leaves it out too.
    filters: (layer.filters ?? view.config.filters).filter(isComplete),
    match: layer.match ?? view.config.match,
    sorts,
    groupBy: layer.groupBy === undefined ? view.config.groupByFieldId : layer.groupBy,
    // Newest first is the DEFAULT for a view nobody sorted; a sort, the
    // view's or the person's, is a choice, and "Table order" switches it off.
    newestFirst: sorts.length === 0 && layer.newestFirst !== false,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True when what the person sees is not the shared view: the toolbar tints (C7). */
export function differsFromShared(view: View, layer: PersonalLayer): boolean {
  const c = view.config;
  if (layer.search !== undefined && layer.search.trim() !== c.search.trim()) return true;
  if (layer.filters !== undefined && !same(layer.filters, c.filters)) return true;
  if (layer.match !== undefined && layer.filters?.length && layer.match !== c.match) return true;
  if (layer.sorts !== undefined && !same(layer.sorts, c.sorts)) return true;
  if (layer.groupBy !== undefined && layer.groupBy !== c.groupByFieldId) return true;
  if (layer.hiddenFieldIds !== undefined && !same([...layer.hiddenFieldIds].sort(), [...c.hiddenFieldIds].sort())) return true;
  if (layer.cardFieldIds !== undefined) return true;
  if (layer.fieldOrder !== undefined && !same(layer.fieldOrder, c.fieldOrder)) return true;
  if (layer.rowColorFieldId !== undefined && layer.rowColorFieldId !== c.rowColorFieldId) return true;
  return layer.newestFirst === false && sortsOf(view, layer).length === 0;
}

/** The view's fields in its order, without the hidden ones (the person's hidden list wins). */
export function visibleFields(fields: FieldDefinition[], view: View, layer: PersonalLayer): FieldDefinition[] {
  const hidden = new Set(layer.hiddenFieldIds ?? view.config.hiddenFieldIds);
  return orderedFields(fields, view, layer).filter((field) => !hidden.has(field.id));
}

/** Every field, in the person's order, else the view's, else the table's (a field new since keeps its place at the end). */
export function orderedFields(fields: FieldDefinition[], view: View, layer: PersonalLayer): FieldDefinition[] {
  const order = layer.fieldOrder ?? view.config.fieldOrder;
  const rank = (field: FieldDefinition) => {
    const at = order.indexOf(field.id);
    return at === -1 ? order.length + field.position : at;
  };
  return [...fields].sort((a, b) => rank(a) - rank(b));
}

/** One field one place up or down in the order on screen. */
export function moveField(ordered: number[], fieldId: number, by: -1 | 1): number[] {
  const at = ordered.indexOf(fieldId);
  const to = at + by;
  if (at === -1 || to < 0 || to >= ordered.length) return ordered;
  const next = [...ordered];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** The fields a card shows under its title: the person's choice, else the first visible ones. */
export function cardFields(fields: FieldDefinition[], primaryFieldId: number | null, view: View, layer: PersonalLayer): FieldDefinition[] {
  if (layer.cardFieldIds) {
    const byId = new Map(fields.map((field) => [field.id, field]));
    return layer.cardFieldIds
      .filter((fieldId) => fieldId !== primaryFieldId)
      .map((fieldId) => byId.get(fieldId))
      .filter((field): field is FieldDefinition => field !== undefined)
      .slice(0, CARD_FIELDS);
  }
  return visibleFields(fields, view, layer)
    .filter((field) => field.id !== primaryFieldId)
    .slice(0, CARD_FIELDS);
}

export const layerKey = (userId: number, viewId: number) => `tables.view.${userId}.${viewId}`;

/** The person's layer for a view; nothing chosen when storage is empty, unreadable or damaged. */
export async function readLayer(userId: number, viewId: number): Promise<PersonalLayer> {
  try {
    const raw = await AsyncStorage.getItem(layerKey(userId, viewId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as PersonalLayer) : {};
  } catch {
    return {};
  }
}

/** Keeps the layer; an empty one is removed, which is "Back to the shared view". */
export async function writeLayer(userId: number, viewId: number, layer: PersonalLayer): Promise<void> {
  try {
    const kept = Object.fromEntries(Object.entries(layer).filter(([, v]) => v !== undefined));
    if (Object.keys(kept).length === 0) await AsyncStorage.removeItem(layerKey(userId, viewId));
    else await AsyncStorage.setItem(layerKey(userId, viewId), JSON.stringify(kept));
  } catch {
    // A phone that cannot store it still shows the layer for this visit.
  }
}
