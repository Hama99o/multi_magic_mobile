/**
 * One occurrence in the agenda — the last handle in `flow_lint --untouched`'s
 * backlog that is not blocked on a rebuild or on an empty account, and a
 * component with no test file of any kind until now.
 *
 * `event-repeats` is the reason it was on the list, and the file's own header
 * says why it matters: *"a weekly stand-up that looks like a one-off is a
 * small lie."* It is one 13 dp glyph, conditional on a field, with nothing
 * watching it — the easiest thing in the app to delete by accident while
 * tidying a row.
 *
 * ── WHAT THIS CANNOT DO ──────────────────────────────────────────────────
 * It does not move the untouched counter, which asks whether a FLOW reaches a
 * handle. Nothing here reaches it; a flow would need the QA account to own a
 * recurring event, and it does not. This closes the behaviour, not the
 * coverage question, and those are different axes on purpose.
 *
 * And it measures no pixel. The left time column exists so an all-day event
 * leaves no hole, which is a claim about layout; what is asserted here is
 * only that the words that fill the column are the right ones.
 */
import { render, screen } from "@testing-library/react-native";
import { EventRow } from "../EventRow";
import type { Occurrence } from "@/api/calendar";

function occurrence(over: Partial<Occurrence> = {}, event: Partial<Occurrence["event"]> = {}): Occurrence {
  return {
    key: "5:2026-09-20",
    on: "2026-09-20",
    startsAt: "2026-09-20T09:00:00Z",
    endsAt: "2026-09-20T09:30:00Z",
    allDay: false,
    ...over,
    event: {
      id: 5,
      title: "Dentist",
      description: null,
      location: null,
      kind: null,
      recurrence: null,
      color: null,
      ...event,
    },
  };
}

describe("the repeat glyph", () => {
  // The whole feature, and it is one conditional.
  // `getAllByTestId`, not `getByTestId`, and the reason is a trap worth
  // knowing: **a lucide icon puts its testID on BOTH its wrapper and the Svg
  // inside it**, so `getByTestId` throws "Found multiple elements" on every
  // icon in this app. `flow_lint.py` cannot see it either — it resolves
  // handles against the source, where the testID appears once. Flagged by the
  // session holding the device, and I walked straight into it an hour later.
  it("is there when the event recurs", () => {
    render(<EventRow occurrence={occurrence({}, { recurrence: "FREQ=WEEKLY" })} onPress={jest.fn()} />);

    expect(screen.getAllByTestId("event-repeats").length).toBeGreaterThan(0);
  });

  it("is absent when it does not, rather than dimmed", () => {
    render(<EventRow occurrence={occurrence()} onPress={jest.fn()} />);

    // Absent, not present-and-faint: a glyph that is always there says
    // nothing, and this one exists to say something.
    expect(screen.queryByTestId("event-repeats")).toBeNull();
  });
});

describe("the time column", () => {
  // The column exists so an all-day event leaves no HOLE — "All day" sits in
  // the slot a time would. That is why the words matter.
  it("says All day rather than leaving the slot empty", () => {
    render(
      <EventRow
        occurrence={occurrence({ allDay: true, startsAt: null, endsAt: null })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText("All day")).toBeTruthy();
  });

  it("gives a timed event a duration in minutes under an hour", () => {
    render(<EventRow occurrence={occurrence()} onPress={jest.fn()} />);

    expect(screen.getByText("30 min")).toBeTruthy();
  });

  it("switches to hours at an hour, and does not say 60 min", () => {
    render(
      <EventRow
        occurrence={occurrence({ endsAt: "2026-09-20T10:30:00Z" })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText("1.5 h")).toBeTruthy();
    expect(screen.queryByText("90 min")).toBeNull();
  });

  it("says nothing rather than something wrong when the end is missing", () => {
    render(<EventRow occurrence={occurrence({ endsAt: null })} onPress={jest.fn()} />);

    // A duration of "0 min" or a dash would both be inventions. The row
    // simply does not claim one.
    expect(screen.queryByText(/min$/)).toBeNull();
    expect(screen.queryByText(/ h$/)).toBeNull();
  });
});

describe("what a screen reader is told", () => {
  it("names the event and when, not just the title", () => {
    render(<EventRow occurrence={occurrence()} onPress={jest.fn()} />);

    // `calendar.event` — the key that existed in both locales, was asserted
    // by the locale test, and was called by nothing while this component
    // interpolated its own English template two lines below it
    // (`docs/TESTING.md` §8). This is what stops that returning.
    // A PATTERN, not the rendered string. `timeLabel` goes through
    // `toLocaleTimeString`, so the exact text depends on the runner's zone and
    // locale — this box renders "11:00 AM" for 09:00Z. Asserting the literal
    // would pin the test to a timezone; re-deriving it with the same call
    // would compare the value against itself, which is `docs/TESTING.md` §3.
    // The shape is the claim: a title, then a time. It fails if the label
    // becomes the bare title again, which is the regression it guards.
    expect(
      screen.getByTestId("calendar-event-5:2026-09-20").props.accessibilityLabel,
    ).toMatch(/^Dentist, \d{1,2}:\d{2}/);
  });

  it("says what a tap will do, because it composes a question rather than opening a record", () => {
    render(<EventRow occurrence={occurrence()} onPress={jest.fn()} />);

    expect(screen.getByTestId("calendar-event-5:2026-09-20").props.accessibilityHint).toBe(
      "Opens the assistant with a question about this event",
    );
  });
});

// ── A TIMESTAMP IT CANNOT READ ─────────────────────────────────────────────
//
// This block first asserted the OLD behaviour — "All day" — as *current
// rather than correct*, on the reasoning that the server always sends either
// a timestamp or `all_day: true`, so the branch was unreachable.
//
// That reasoning was wrong and Hamma9901 named why: it is a claim about
// today's DATA, not about this code. A calendar row renders whatever the
// server sends, and the parser is the only thing between a malformed
// timestamp and that row. It is also the worst failure available on this
// screen — a confident wrong answer, in an app whose purpose is telling
// somebody when things are, on a row they will act on. Somebody misses a
// 09:00 dentist because the row said the day was free.
//
// So the parser fails instead of guessing, and these assert the honest
// answer.
describe("a timestamp it cannot read", () => {
  it("says it does not know, rather than calling it an all-day event", () => {
    render(<EventRow occurrence={occurrence({ startsAt: "not a date" })} onPress={jest.fn()} />);

    expect(screen.getByText("Unknown")).toBeTruthy();
    // The specific lie this replaces: a day that looks free.
    expect(screen.queryByText("All day")).toBeNull();
  });

  it("tells a screen reader the same thing it tells the screen", () => {
    render(<EventRow occurrence={occurrence({ startsAt: "not a date" })} onPress={jest.fn()} />);

    // The label runs through the same `timeLabel`, so a fix that only
    // corrected the visible column would leave the spoken one saying
    // "Dentist, All day" — the original lie, to the person least able to
    // check it against anything else on the row.
    expect(
      screen.getByTestId("calendar-event-5:2026-09-20").props.accessibilityLabel,
    ).toBe("Dentist, Unknown");
  });

  // A real all-day event is still an all-day event — the fix must not have
  // turned every one of them into "Unknown".
  it("still says All day when the event really is one", () => {
    render(
      <EventRow
        occurrence={occurrence({ allDay: true, startsAt: null, endsAt: null })}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText("All day")).toBeTruthy();
    expect(screen.queryByText("Unknown")).toBeNull();
  });
});
