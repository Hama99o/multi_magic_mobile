/**
 * The three suggestions in the empty state, DERIVED from what the user actually
 * has — never written down here.
 *
 * His instruction: *"the three prompts which show for first conversation should
 * be linked to its data — it is important, it should not be a random thing."*
 *
 * ── Why hardcoding them satisfies the spec and misses the point ───────────
 * `chat/SPEC.md` says "three example questions drawn from the apps that exist",
 * and three invented sentences read as though they satisfy that. They do not.
 * **The whole claim of this app is that it answers from his own data**, so
 * three questions with nothing behind them are that claim with nothing behind
 * it — and one naming an app he has never used actively misleads, because the
 * answer will be "I could not find anything" to a question the app suggested.
 *
 * ── What this derives, strongest signal first ─────────────────────────────
 *   - **files in this conversation** — a concrete noun, the strongest kind:
 *     the user chose that document, so a question about it is certainly useful
 *   - **events in the next week** — real, dated, and named
 *   - **apps that hold anything** — `GET /api/v1/me/summary`, added
 *     2026-09-19 (`multi_magic@39ec585`) because this file asked for it: "the
 *     full version wants a small endpoint in the API and that has been
 *     raised." It returns COUNTS ONLY, so a prompt from it can name an app but
 *     never a record — which is exactly why it ranks below the two sources
 *     that already have a noun, rather than replacing them.
 *
 * ── Three rules, and the third is the one that keeps it honest ────────────
 * 1. A concrete noun beats a category: "What does invoice.pdf say?" beats
 *    "Ask about your files", and the noun comes from his data.
 * 2. Never a placeholder to reach three. **Two real suggestions beat three with
 *    one invented** — the spec's own fallback and the honest one.
 * 3. If nothing can be derived, return NONE. An empty composer under one plain
 *    sentence is honest; three guesses are not.
 */
import { useQuery } from "@tanstack/react-query";
import { documentsApi } from "@/api/ai";
import { calendarApi } from "@/api/calendar";
import { APP_NOUN, meApi, type AppKey } from "@/api/me";

export interface StarterPrompt {
  /** The question asked verbatim when tapped. */
  text: string;
  /** Where it came from, so a reader can tell derived from invented. */
  source: "file" | "calendar" | "app";
}

/** Longest a suggestion may be before it stops being readable on a 360 dp row. */
const MAX_LENGTH = 64;

function shorten(noun: string): string {
  return noun.length > 28 ? `${noun.slice(0, 27)}…` : noun;
}

export function buildPrompts(
  files: { filename: string; status: string }[],
  events: { title: string }[],
  /** Apps holding anything, best-stocked first — the server's ranking. */
  stocked: AppKey[] = [],
): StarterPrompt[] {
  const prompts: StarterPrompt[] = [];

  // A file the user put in THIS conversation is the most certain signal there
  // is — they chose it. Only a READY one: asking about a document still being
  // extracted produces "I could not find anything" about a file on screen.
  files
    .filter((f) => f.status === "ready")
    .slice(0, 2)
    .forEach((file) => {
      prompts.push({ text: `What does ${shorten(file.filename)} say?`, source: "file" });
    });

  // THE NAMED EVENT FIRST, because it is the concrete one. Offering both
  // "When is Dentist?" and "What is on my calendar this week?" off a single
  // event is two questions about one fact — which is padding wearing a
  // derivation's clothes.
  if (events[0]?.title) {
    prompts.push({ text: `When is ${shorten(events[0].title)}?`, source: "calendar" });
  }
  // The week only earns a slot when there is actually a week's worth to ask
  // about; with one event it says nothing the line above did not.
  if (events.length >= 3) {
    prompts.push({ text: "What is on my calendar this week?", source: "calendar" });
  }

  // ── AND ONLY THEN, THE APPS THAT HOLD SOMETHING ───────────────────────
  //
  // Last, because a count has no noun: "Ask about your loans" is weaker than
  // "When is Dentist?" and must not displace it. `calendar` is skipped here
  // when an event already spoke above — two questions about one fact is
  // padding wearing a derivation's clothes, which is rule 2.
  //
  // Rule 3 is unchanged and is what this source must not break: an app with
  // ZERO records never appears, because the server leaves it out of `stocked`.
  // That is the whole reason this is a counts endpoint and not a guess.
  const alreadySpokenFor: Partial<Record<AppKey, boolean>> = {
    // A named event said it better; a named file did too. Offering the
    // category as well is two questions about one fact.
    events: prompts.some((p) => p.source === "calendar"),
    documents: prompts.some((p) => p.source === "file"),
  };
  for (const app of stocked) {
    if (prompts.length >= 3) break;
    if (alreadySpokenFor[app]) continue;
    prompts.push({ text: `What is in my ${APP_NOUN[app]}?`, source: "app" });
  }

  return prompts.filter((p) => p.text.length <= MAX_LENGTH).slice(0, 3);
}

export function useStarterPrompts(conversationId: number | null): {
  prompts: StarterPrompt[];
  loading: boolean;
} {
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["ai", "documents", conversationId],
    queryFn: () => documentsApi.list(conversationId as number),
    enabled: conversationId != null,
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["calendar", "upcoming", 7],
    queryFn: () => calendarApi.upcoming(7),
    // A failure here means no calendar suggestion, never a broken empty state.
    retry: false,
  });

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["me", "summary"],
    queryFn: meApi.summary,
    // Same rule as the calendar above: a failure here means one suggestion
    // fewer, never a broken empty state.
    retry: false,
  });

  return {
    // An Occurrence wraps the event; the title lives on the event itself.
    prompts: buildPrompts(
      files,
      events.map((o) => ({ title: o.event.title })),
      summary?.stocked ?? [],
    ),
    loading: filesLoading || eventsLoading || summaryLoading,
  };
}
