/**
 * The assistant wrote an event, so the calendar re-reads itself.
 *
 * The signal is the reply's own `links`, each carrying a route key, arriving
 * on `MessageChannel` — which streams to the USER, so it reaches a screen the
 * question was not asked on. Nothing is polled and no path string is parsed.
 */
import { renderHook } from "@testing-library/react-native";

const mockSubscribe = jest.fn();
jest.mock("@/lib/cable", () => ({
  subscribeToChannel: (...args: unknown[]) => mockSubscribe(...args),
}));

/* eslint-disable import/first */
import { CALENDAR_KEYS, NOTIFICATION_KEYS, useAssistantEcho } from "../useAssistantEcho";

/** The raw serializer shape, as a socket frame carries it. */
function frame(role: string, links: { key: string; label: string }[]) {
  return {
    message: {
      id: 31,
      conversation_id: 4,
      user_id: role === "user" ? 2 : null,
      role,
      body: "Added it to your calendar.",
      created_at: "2026-09-19T10:00:00Z",
      deleted: false,
      sent_by_me: role === "user",
      edited_at: null,
      read_at: null,
      reactions: [],
      links: links.map((link) => ({ ...link, path: "/calendar?event=9" })),
      sources: [],
      undoable: true,
      undone_at: null,
    },
  };
}

const deliver = (payload: unknown) => {
  const listener = mockSubscribe.mock.calls.at(-1)![1] as { onData: (p: unknown) => void };
  listener.onData(payload);
};

let unsubscribe: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  unsubscribe = jest.fn();
  mockSubscribe.mockReturnValue(unsubscribe);
});

describe("an assistant reply that created something", () => {
  it("refreshes when the record belongs to this screen", () => {
    const onChanged = jest.fn();
    renderHook(() => useAssistantEcho(CALENDAR_KEYS, onChanged));

    deliver(frame("assistant", [{ key: "calendar_event", label: "Dentist" }]));

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(mockSubscribe.mock.calls[0][0]).toBe("MessageChannel");
  });

  it("ignores a record that belongs to another app", () => {
    const onChanged = jest.fn();
    renderHook(() => useAssistantEcho(CALENDAR_KEYS, onChanged));

    deliver(frame("assistant", [{ key: "note", label: "Groceries" }]));

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores the QUESTION, which creates nothing", () => {
    const onChanged = jest.fn();
    renderHook(() => useAssistantEcho(CALENDAR_KEYS, onChanged));

    deliver(frame("user", [{ key: "calendar_event", label: "Dentist" }]));

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores an ordinary answer that created nothing", () => {
    const onChanged = jest.fn();
    renderHook(() => useAssistantEcho(CALENDAR_KEYS, onChanged));

    deliver(frame("assistant", []));

    expect(onChanged).not.toHaveBeenCalled();
  });

  // `useConversation` already resyncs on an unreadable frame; refetching this
  // screen as well would refresh it for every malformed frame.
  it("is not a refresh signal when the frame cannot be read", () => {
    const onChanged = jest.fn();
    renderHook(() => useAssistantEcho(CALENDAR_KEYS, onChanged));

    deliver({ message: { id: "not-a-number" } });
    deliver({});

    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("the subscription", () => {
  it("is not opened at all when nothing is watched", () => {
    renderHook(() => useAssistantEcho(NOTIFICATION_KEYS, jest.fn()));

    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  // A screen passes an inline callback; rebuilding the subscription each
  // render would also mean a `connected` callback, and a refetch, per render.
  it("survives a re-render with a fresh callback", () => {
    const { rerender } = renderHook<void, { fn: () => void }>(
      ({ fn }) => useAssistantEcho(CALENDAR_KEYS, fn),
      { initialProps: { fn: jest.fn() } },
    );

    const second = jest.fn();
    rerender({ fn: second });
    deliver(frame("assistant", [{ key: "calendar_event", label: "Dentist" }]));

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
    // And the NEWEST callback is the one that runs.
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("closes on unmount", () => {
    const { unmount } = renderHook(() => useAssistantEcho(CALENDAR_KEYS, jest.fn()));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
