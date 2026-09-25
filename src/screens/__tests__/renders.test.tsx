/**
 * SMOOTHNESS, LAYER 1: HOW MANY TIMES DOES EACH ROW RENDER? (2026-09-25)
 *
 * Deterministic and at the desk. Smoothness in React Native usually dies in
 * re-renders rather than in animation: if every visible message re-renders on
 * a keystroke, no animation tuning helps. That happened here once (app/chat.tsx,
 * "STABLE, so typing re-renders no row at all": 212–382 ms per commit while
 * typing, measured with React.Profiler on qa_phone4, 2026-09-24).
 *
 * So each row's REAL renders are counted during what a person does, and each
 * sequence has a written budget:
 *
 *   typing 10 characters     no row renders, no list cell renders (0)
 *   a reply arrives          old rows 0; the new row ≤ 2 (mount, plus the
 *                            `Arriving` fade handing over)
 *   one message is edited    only that row renders
 *   scrolling the history    no already-mounted row renders
 *
 * There is no token streaming in this app: a reply lands whole, over the
 * socket (`useConversation`, `onData`). "Streaming" here is the socket frames
 * that do arrive: a new message, and an edit to one.
 *
 * HOW THE COUNT IS TAKEN. `MessageRow` is `memo(inner)`. The mock rebuilds the
 * SAME memo (same inner function, same comparison) around a counter, so memo
 * still decides whether a render happens and the counter sees only the renders
 * that really happen. `PersonMessageRow` is a plain function behind the
 * thread's memoised `ThreadRow`, so counting its calls counts what that memo
 * lets through.
 *
 * PLANTED, 2026-09-25, and what each budget does and does not catch:
 *   an inline function prop on MessageRow       → arrival and edit red
 *   the assistant's renderItem rebuilt per render → typing red (100 cell
 *     renders: 10 keystrokes × 10 cells) and scroll red (10); MessageRow's
 *     memo alone still held every ROW at 0, which is why cells are counted
 *   the thread's ThreadRow memo always "changed"  → arrival red; typing
 *     stayed green, because the thread's list does not re-render at all
 *   the thread's renderItem rebuilt per render    → green alone (ThreadRow's
 *     memo holds); with the memo also off, typing 100 and arrival 8, red.
 *     Typing in the thread is guarded twice, and this fails only when both
 *     guards break. Said here rather than implied by a green.
 *
 * What it cannot see: time. A render that happens and takes 300 ms is
 * counted once. That is layer 2's (`qa/gfxinfo.sh`), on a device.
 */
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { FlatList } from "react-native";
import { fixture, journey, serveApi } from "@/__tests__/journey";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import i18n from "@/i18n";
import Assistant from "../../../app/chat";
import Thread from "../../../app/chat/[id]";

// jest.mock is hoisted above every import, so these mocks are in place first.
jest.mock("expo-router", () => require("@/__tests__/screenMocks").expoRouter);
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);
jest.mock("expo-haptics", () => require("@/__tests__/screenMocks").haptics);
jest.mock("expo-linking", () => require("@/__tests__/screenMocks").linking);
jest.mock("expo-image-picker", () => require("@/__tests__/screenMocks").imagePicker);
jest.mock("@/lib/cable", () => require("@/__tests__/screenMocks").cable);

jest.mock("@/components/chat/MessageRow", () => {
  const React = require("react");
  const actual = jest.requireActual("@/components/chat/MessageRow");
  const renders = new Map<number, number>();
  const real = actual.MessageRow as { type: (p: unknown) => unknown; compare: ((a: unknown, b: unknown) => boolean) | null };
  const Counted = React.memo(function CountedMessageRow(props: { message: { id: number } }) {
    renders.set(props.message.id, (renders.get(props.message.id) ?? 0) + 1);
    return real.type(props);
  }, real.compare ?? undefined);
  return { ...actual, MessageRow: Counted, __renders: renders };
});
// One level up: the list's CELL. A `renderItem` rebuilt on every render
// re-renders every visible cell (and its `Arriving` wrapper) even when
// MessageRow's memo then stops the row itself. Cheaper than a row render,
// and still work done per keystroke, so it has a budget too.
jest.mock("@/components/chat/Arriving", () => {
  const actual = jest.requireActual("@/components/chat/Arriving");
  const counter = { n: 0 };
  return {
    ...actual,
    Arriving: (props: { arriving: boolean; children: unknown }) => {
      counter.n += 1;
      return actual.Arriving(props);
    },
    __cells: counter,
  };
});
jest.mock("@/screens/people/PersonMessageRow", () => {
  const actual = jest.requireActual("@/screens/people/PersonMessageRow");
  const renders = new Map<number, number>();
  return {
    ...actual,
    PersonMessageRow: (props: { message: { id: number } }) => {
      renders.set(props.message.id, (renders.get(props.message.id) ?? 0) + 1);
      return actual.PersonMessageRow(props);
    },
    __renders: renders,
  };
});

const assistantRenders = (): Map<number, number> => jest.requireMock("@/components/chat/MessageRow").__renders;
const threadRenders = (): Map<number, number> => jest.requireMock("@/screens/people/PersonMessageRow").__renders;
const cells = (): { n: number } => jest.requireMock("@/components/chat/Arriving").__cells;
const total = (m: Map<number, number>, only?: (id: number) => boolean) =>
  [...m].reduce((n, [id, c]) => n + (only && !only(id) ? 0 : c), 0);

/** The socket listener a screen subscribed with, to deliver frames to it. */
function socket(channel: string): (payload: unknown) => void {
  const calls = (jest.requireMock("@/lib/cable").subscribeToChannel as jest.Mock).mock.calls;
  const hit = [...calls].reverse().find((c) => c[0] === channel);
  if (!hit) throw new Error(`nothing subscribed to ${channel}`);
  return (payload) => hit[1].onData(payload);
}

const RAW = fixture("ai_messages_latest").messages as Record<string, unknown>[];

let mock: MockAdapter;
let j: ReturnType<typeof journey>;
beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  (jest.requireMock("@/lib/cable").subscribeToChannel as jest.Mock).mockClear();
  assistantRenders().clear();
  threadRenders().clear();
  j = journey();
  serveApi(mock);
});
afterEach(() => {
  j.end();
  mock.restore();
});

async function assistantLoaded() {
  j.visit(<Assistant />);
  await screen.findByTestId("composer-input");
  // The transcript is on screen: rows rendered at least once.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(assistantRenders().size).toBeGreaterThan(3);
  const mounted = new Set(assistantRenders().keys());
  assistantRenders().clear();
  cells().n = 0;
  return mounted;
}

describe("the assistant", () => {
  it("typing ten characters renders no message row and no list cell (budget 0)", async () => {
    await assistantLoaded();
    const input = screen.getByTestId("composer-input");
    for (const text of ["W", "Wh", "Wha", "What", "What ", "What i", "What is", "What is ", "What is o", "What is on"]) {
      fireEvent.changeText(input, text);
    }
    expect(total(assistantRenders())).toBe(0);
    expect(cells().n).toBe(0);
  });

  it("a reply arriving renders only the new row (old rows 0, new ≤ 2)", async () => {
    const mounted = await assistantLoaded();
    const reply = { ...RAW[0], id: 99001, created_at: new Date().toISOString(), body: "A new answer." };
    act(() => socket("MessageChannel")({ message: reply }));
    await screen.findByText("A new answer.");
    expect(total(assistantRenders(), (id) => mounted.has(id))).toBe(0);
    expect(assistantRenders().get(99001) ?? 0).toBeGreaterThanOrEqual(1);
    expect(assistantRenders().get(99001) ?? 0).toBeLessThanOrEqual(2);
  });

  it("an edit to one message renders that row only", async () => {
    const mounted = await assistantLoaded();
    const target = RAW.find((m) => mounted.has(m.id as number))!;
    act(() => socket("MessageChannel")({ message: { ...target, body: "Edited body.", edited_at: new Date().toISOString() } }));
    await screen.findByText("Edited body.");
    const others = total(assistantRenders(), (id) => id !== target.id);
    expect(others).toBe(0);
    expect(assistantRenders().get(target.id as number)).toBe(1);
  });

  it("scrolling the history renders no row already on screen (budget 0)", async () => {
    const mounted = await assistantLoaded();
    const list = screen.UNSAFE_getAllByType(FlatList)[0];
    for (let y = 0; y <= 2000; y += 100) {
      fireEvent.scroll(list, {
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 400, height: 6000 },
          layoutMeasurement: { width: 400, height: 800 },
        },
      });
    }
    expect(total(assistantRenders(), (id) => mounted.has(id))).toBe(0);
    expect(cells().n).toBe(0);
  });
});

describe("a thread with a person", () => {
  async function threadLoaded() {
    j.visit(<Thread />);
    await screen.findByTestId("thread-list");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(threadRenders().size).toBeGreaterThan(3);
    const mounted = new Set(threadRenders().keys());
    threadRenders().clear();
    return mounted;
  }

  it("typing ten characters renders no message row (budget 0)", async () => {
    await threadLoaded();
    const input = screen.getByTestId("people-composer-input");
    for (let n = 1; n <= 10; n++) fireEvent.changeText(input, "Hello there".slice(0, n));
    expect(total(threadRenders())).toBe(0);
  });

  it("a message arriving renders only the new row", async () => {
    const mounted = await threadLoaded();
    const incoming = { ...RAW[1], id: 99002, conversation_id: 266, created_at: new Date().toISOString(), body: "Are you there?", sent_by_me: false };
    act(() => socket("MessageChannel")({ message: incoming }));
    await screen.findByText("Are you there?");
    expect(total(threadRenders(), (id) => mounted.has(id))).toBe(0);
  });
});
