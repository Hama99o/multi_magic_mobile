/**
 * How much of each app the signed-in person has — `GET /api/v1/me/summary`.
 *
 * Built for one job: the assistant's empty state. His instruction was *"the
 * three prompts which show for first conversation should be linked to its data
 * — it should not be a random thing"*, and until this endpoint existed the app
 * could only derive a prompt from a file already in the conversation or an
 * event it had been told about (`useStarterPrompts.ts` says so in its own
 * header). Counts are what let it say "you have loans" without asking for one.
 *
 * ── COUNTS ONLY, AND THAT IS ENFORCED ON THE OTHER SIDE ───────────────────
 * Every value is an Integer; `Me::Summary` has no branch that could emit a
 * title and no option to ask for one. So a prompt built from this can name an
 * APP but never a record — "Ask about your loans", never "Ask about the loan to
 * Anisa". A prompt that carries a concrete noun has to come from somewhere
 * that already had the noun, which is why the file and calendar sources stay.
 *
 * ── `stocked` IS THE SERVER'S RANKING AND IS NOT RE-DERIVED HERE ──────────
 * Best-stocked first. Re-sorting the counts on the client would be a second
 * implementation of one order, and that is how the phone and the web come to
 * offer different prompts from identical data.
 */
import { http } from "./http";
import { obj } from "./parse";

/** Keys match `Ai::AppCatalog::APPS`, so the empty state and the assistant's
 *  own search scope cannot drift into different names for the same app. */
export type AppKey =
  | "notes"
  | "todos"
  | "expenses"
  | "incomes"
  | "loans"
  | "events"
  | "contacts"
  | "pages"
  | "documents";

export interface MeSummary {
  counts: Partial<Record<AppKey, number>>;
  /** The apps holding anything, best-stocked first. */
  stocked: AppKey[];
}

const KNOWN: readonly AppKey[] = [
  "notes", "todos", "expenses", "incomes", "loans", "events", "contacts", "pages", "documents",
];

function isAppKey(value: unknown): value is AppKey {
  return typeof value === "string" && (KNOWN as readonly string[]).includes(value);
}

export const meApi = {
  /**
   * Tolerant on purpose, in one direction only.
   *
   * An unknown app key is DROPPED rather than throwing: the server gains apps
   * over time, and a phone that has not been updated should offer one prompt
   * fewer, not refuse to render its empty state. A count that is not a number
   * is dropped for the same reason — there is no decision here worth failing a
   * screen over.
   *
   * What it does NOT tolerate is a missing envelope, because that means the
   * endpoint is not what we think it is.
   */
  summary: async (): Promise<MeSummary> => {
    const res = await http.get("/api/v1/me/summary");
    const record = obj(res.data, "summary");
    const rawCounts = obj(record.counts, "summary.counts");

    const counts: Partial<Record<AppKey, number>> = {};
    for (const [key, value] of Object.entries(rawCounts)) {
      if (isAppKey(key) && typeof value === "number" && Number.isFinite(value)) {
        counts[key] = value;
      }
    }

    return {
      counts,
      stocked: (Array.isArray(record.stocked) ? record.stocked : []).filter(isAppKey),
    };
  },
};

/**
 * What to call each app in a suggestion, in the words a person uses.
 *
 * Not the catalog's own `name` — "My Finance" is the product's label and
 * "your expenses" is what somebody would actually ask about. A prompt reads as
 * a question, not as a menu item.
 */
export const APP_NOUN: Record<AppKey, string> = {
  notes: "notes",
  todos: "tasks",
  expenses: "expenses",
  incomes: "income",
  loans: "loans",
  events: "calendar",
  contacts: "contacts",
  pages: "pages",
  documents: "documents",
};
