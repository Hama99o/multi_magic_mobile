/**
 * The socket. None of this is visible by looking at a screen: a missing `fp`
 * rejects every connection as a stolen token, and a reconnect that does not
 * announce itself shows a transcript that is merely out of date.
 */
import * as SecureStore from "expo-secure-store";

/**
 * These are `mock`-prefixed because jest.mock() factories are HOISTED above the
 * imports, and Jest forbids a factory touching any out-of-scope variable whose
 * name does not start with `mock` — a guard against reading one before it is
 * initialised.
 */
const mockCreated: { url: string }[] = [];
const mockSubscriptions: {
  identifier: unknown;
  mixin: { received?: (d: unknown) => void; connected?: () => void; rejected?: () => void };
  unsubscribe: jest.Mock;
  perform: jest.Mock;
}[] = [];

let mockSocketOpen = true;
const mockReopen = jest.fn();
const mockDisconnect = jest.fn();
let mockAppStateHandler: ((s: string) => void) | null = null;

jest.mock("@rails/actioncable", () => ({
  createConsumer: (url: string) => {
    mockCreated.push({ url });
    return {
      subscriptions: {
        create: (identifier: unknown, mixin: Record<string, unknown>) => {
          const sub = {
            identifier,
            mixin: mixin as (typeof mockSubscriptions)[number]["mixin"],
            unsubscribe: jest.fn(),
            perform: jest.fn(),
          };
          mockSubscriptions.push(sub);
          return sub;
        },
      },
      connection: { isOpen: () => mockSocketOpen, reopen: mockReopen },
      disconnect: mockDisconnect,
    };
  },
}));

// THESE IMPORTS MUST STAY BELOW the `mock`-prefixed declarations above.
// `jest.mock` is hoisted, but its factory runs LAZILY — at the moment
// `@rails/actioncable` is first required, which `cable.ts` does at module
// scope. Importing above the consts runs the factory while they are still in
// the temporal dead zone: "Cannot access 'mockCreated' before initialization".
/* eslint-disable import/first */
import { AppState } from "react-native";
import { performOnChannel, resetCable, subscribeToChannel } from "../cable";
import { setSessionEmail, setToken, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "../fingerprint";

/** The subscribe path reads the keystore, so let those promises settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(async () => {
  mockCreated.length = 0;
  mockSubscriptions.length = 0;
  mockSocketOpen = true;
  mockAppStateHandler = null;
  // A spy rather than jest.mock("react-native"): replacing the module wholesale
  // drops `Platform`, and spreading `requireActual` eagerly evaluates every lazy
  // getter on RN's index — pulling FlatList and ActivityIndicator into a test
  // about a WebSocket.
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _event: string,
    handler: (s: string) => void,
  ) => {
    mockAppStateHandler = handler;
    return { remove: jest.fn() };
  }) as never);
  mockReopen.mockClear();
  mockDisconnect.mockClear();
  jest.clearAllMocks();
  resetCable();
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => null);
  await setToken("Bearer eyJ.a.b");
  await setSessionEmail("person@example.com");
});

describe("the socket URL", () => {
  // A WebSocket upgrade cannot carry custom headers, so all three travel as
  // query parameters. multi_magic's connection.rb records that omitting `fp`
  // made it compare the stored fingerprint against an empty one and reject
  // every connection — "messages typed into a chat went nowhere".
  it("carries token, email AND fp", async () => {
    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    const url = new URL(mockCreated[0].url);
    expect(url.searchParams.get("token")).toBe("Bearer eyJ.a.b");
    expect(url.searchParams.get("email")).toBe("person@example.com");
    expect(url.searchParams.get("fp")).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("sends the token PREFIXED, matching the web — the server does token.split.last", async () => {
    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    expect(new URL(mockCreated[0].url).searchParams.get("token")).toMatch(/^Bearer /);
  });

  it("does not open a socket at all when signed out", async () => {
    await setToken(null);
    await setSessionEmail(null);

    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    expect(mockCreated).toHaveLength(0);
  });
});

describe("one socket, many channels", () => {
  it("shares a single consumer", async () => {
    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();
    subscribeToChannel("ConversationChannel", { onData: jest.fn() }, { conversation_id: 9 });
    await settle();

    // A consumer per feature means a fresh handshake whenever one mounts, and
    // ActionCable never replays what it dropped during the gap.
    expect(mockCreated).toHaveLength(1);
    expect(mockSubscriptions).toHaveLength(2);
  });

  it("passes channel params through, which is what ConversationChannel needs", async () => {
    subscribeToChannel("ConversationChannel", { onData: jest.fn() }, { conversation_id: 9 });
    await settle();

    expect(mockSubscriptions[0].identifier).toEqual({
      channel: "ConversationChannel",
      conversation_id: 9,
    });
  });

  it("gives each thread its own subscription", async () => {
    subscribeToChannel("ConversationChannel", { onData: jest.fn() }, { conversation_id: 9 });
    await settle();
    subscribeToChannel("ConversationChannel", { onData: jest.fn() }, { conversation_id: 10 });
    await settle();

    expect(mockSubscriptions).toHaveLength(2);
  });

  it("keeps ONE subscription for two listeners on the same channel", async () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeToChannel("MessageChannel", { onData: a });
    await settle();
    subscribeToChannel("MessageChannel", { onData: b });
    await settle();

    expect(mockSubscriptions).toHaveLength(1);
    mockSubscriptions[0].mixin.received?.({ message: { id: 1 } });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});

// ── THE RULE THE WHOLE FILE EXISTS FOR ──────────────────────────────────────
describe("onConnected", () => {
  it("fires on the first connect AND on every reconnect", async () => {
    const onConnected = jest.fn();
    subscribeToChannel("MessageChannel", { onData: jest.fn(), onConnected });
    await settle();

    mockSubscriptions[0].mixin.connected?.();
    expect(onConnected).toHaveBeenCalledTimes(1);

    // The socket dropped and came back. ActionCable replays nothing, so this is
    // the only signal that anything was missed — the listener resyncs over HTTP.
    mockSubscriptions[0].mixin.connected?.();
    expect(onConnected).toHaveBeenCalledTimes(2);
  });

  it("reports a rejected subscription instead of waiting forever", async () => {
    const onRejected = jest.fn();
    subscribeToChannel("ConversationChannel", { onData: jest.fn(), onRejected }, { conversation_id: 9 });
    await settle();

    mockSubscriptions[0].mixin.rejected?.();
    expect(onRejected).toHaveBeenCalled();
  });
});

describe("returning to the foreground", () => {
  // The shim drops ActionCable's own `visibilitychange` listener because React
  // Native never emits it. AppState is the real signal, and it matters more on
  // a phone: an answer arriving from a job while the app is pocketed is exactly
  // the case the resync exists for.
  it("reopens a dropped socket when the app comes back", async () => {
    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    mockSocketOpen = false;
    mockAppStateHandler?.("active");

    expect(mockReopen).toHaveBeenCalled();
  });

  it("leaves a healthy socket alone", async () => {
    subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    mockSocketOpen = true;
    mockAppStateHandler?.("active");
    mockAppStateHandler?.("background");

    expect(mockReopen).not.toHaveBeenCalled();
  });
});

describe("performing an action", () => {
  it("sends mark_read on a live subscription", async () => {
    subscribeToChannel("ConversationChannel", { onData: jest.fn() }, { conversation_id: 9 });
    await settle();

    const sent = performOnChannel("ConversationChannel", "mark_read", undefined, { conversation_id: 9 });

    expect(sent).toBe(true);
    expect(mockSubscriptions[0].perform).toHaveBeenCalledWith("mark_read", undefined);
  });

  // `perform` on a subscription that is not up is a SILENT no-op — which is why
  // multi_magic moved sending messages off the socket onto HTTP entirely.
  it("returns false rather than silently dropping it when nothing is subscribed", () => {
    expect(performOnChannel("ConversationChannel", "mark_read", undefined, { conversation_id: 99 })).toBe(false);
  });
});

describe("unsubscribing", () => {
  it("drops the subscription only when the LAST listener leaves", async () => {
    const stopA = subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();
    const stopB = subscribeToChannel("MessageChannel", { onData: jest.fn() });
    await settle();

    stopA();
    expect(mockSubscriptions[0].unsubscribe).not.toHaveBeenCalled();

    stopB();
    expect(mockSubscriptions[0].unsubscribe).toHaveBeenCalled();
  });

  it("cancels cleanly when it unmounts before the socket is up", async () => {
    const stop = subscribeToChannel("MessageChannel", { onData: jest.fn() });
    stop(); // synchronous teardown, mid-connect
    await settle();

    expect(mockSubscriptions).toHaveLength(0);
  });
});
