/**
 * JOURNEYS: several screens, one cache, in the order a person uses them.
 *
 * Every other screen test gives each screen its own QueryClient. That is right
 * for a unit test and it deletes a whole class of bug: one that exists only
 * when two screens share a cache. df9b1f2 was one (the calendar stored a page
 * where the assistant read an array; calendar → back crashed the assistant),
 * and a device found it in its first minute. `queryKeys.test.ts` guards the
 * SHAPES statically; this is where the BEHAVIOUR of a real sequence is run.
 *
 *   const j = journey();
 *   j.visit(<Calendar />);   await screen.findByText("Dentist");
 *   j.visit(<Assistant />);  await screen.findByTestId("chat-empty");
 *   j.end();
 *
 * `visit` unmounts the previous screen first, as leaving a screen does. It
 * does not route: taps that call `router.push` go to the mock. The cache is
 * what is shared, which is the part a unit test cannot share.
 *
 * The API is served at the HTTP layer from the CAPTURED fixtures
 * (`serveApi`), so the real API functions and parsers run.
 */
import fs from "fs";
import path from "path";
import type MockAdapter from "axios-mock-adapter";
import { render, type RenderResult } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { testQueryClient } from "./queryClient";

export const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "../api/__tests__/fixtures", `${name}.json`), "utf8")).body;

/** pagy's block from a list the QA account really has empty. */
export const EMPTY_META = fixture("notifications_page1").meta;

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One calendar occurrence today, shaped as the server sends it. */
export function occurrenceToday(title: string) {
  const on = todayIso();
  return {
    id: `7:${on}`, on, starts_at: `${on}T09:00:00Z`, ends_at: `${on}T09:30:00Z`, all_day: false,
    event: { id: 7, title, description: null, location: null, kind: "appointment", all_day: false, recurrence: null, color: null },
  };
}

/**
 * Every endpoint a screen reads, answered. `mode: "captured"` serves the QA
 * account's real captures (it has chats and messages); `mode: "empty"`
 * serves empty lists. Overrides are registered LAST, because the adapter
 * REPLACES a handler with the same regex text (docs/TESTING.md §19), so an
 * override registered first is silently overwritten by the default.
 */
export function serveApi(mock: MockAdapter, { mode = "captured", overrides = [] }: { mode?: "captured" | "empty"; overrides?: [RegExp, unknown][] } = {}) {
  const empty = mode === "empty";
  mock.onGet(/\/ai\/conversation$/).reply(200, fixture("ai_conversation"));
  mock.onGet(/\/ai\/sessions\/\d+\/documents/).reply(200, { documents: [] });
  mock.onGet(/\/ai\/sessions$/).reply(200, fixture("ai_sessions"));
  mock.onGet(/\/conversations\/\d+\/messages/).reply(200, empty ? { messages: [], meta: EMPTY_META } : fixture("ai_messages_latest"));
  mock.onGet(/\/conversations\/unread_messages_count/).reply(200, fixture("conversations_unread"));
  mock.onGet(/\/conversations(\?|$)/).reply(200, empty ? { conversations: [], meta: EMPTY_META } : fixture("conversations_page1"));
  mock.onGet(/\/notifications\/unread_count/).reply(200, fixture("notifications_unread"));
  mock.onGet(/\/notifications(\?|$)/).reply(200, fixture("notifications_page1"));
  mock.onGet(/\/calendar_app\/events\/upcoming/).reply(200, fixture("calendar_upcoming_7"));
  mock.onGet(/\/me\/summary/).reply(200, empty ? { counts: {}, stocked: [] } : fixture("me_summary"));
  mock.onGet(/\/ai_keys/).reply(200, empty ? { ...fixture("ai_keys"), ai_keys: [], borrowed: [] } : fixture("ai_keys"));
  mock.onGet(/\/users\/connected_user/).reply(200, fixture("connected_user"));
  for (const [url, body] of overrides) mock.onGet(url).reply(200, body);
  mock.onAny().reply(404, { error: "Not found" });
}

export function journey(client: QueryClient = testQueryClient({ queries: { gcTime: 60_000 } })) {
  // gcTime above zero: with the test default of 0, leaving a screen collects
  // its data on the next tick, so a journey that waits between screens would
  // meet an empty cache and share nothing. (A `visit` straight after another
  // mounts in the same tick and still sees it: measured, not assumed.)
  // `end()` clears it, so no five-minute timer outlives the test
  // (docs/TESTING.md §7).
  let view: RenderResult | null = null;
  return {
    client,
    visit(element: ReactElement): RenderResult {
      view?.unmount();
      view = render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
      return view;
    },
    /** Leave the current screen without opening another. */
    leave() {
      view?.unmount();
      view = null;
    },
    end() {
      view?.unmount();
      view = null;
      client.clear();
    },
  };
}
