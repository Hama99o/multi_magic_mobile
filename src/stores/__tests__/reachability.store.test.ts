/**
 * Reachability is OBSERVED: a request with no response marks the server
 * unreached and starts a probe; the first answer — from anything — marks it
 * reached and stops the probe. Nothing runs while all is well.
 */
import MockAdapter from "axios-mock-adapter";
import { PROBE_MS, __resetReachability, useReachability, wireReachability } from "../reachability.store";
import { http, setReachabilityHandler } from "@/api/http";

let mock: MockAdapter;

/** Let axios-mock-adapter's promise chain settle under fake timers. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  mock = new MockAdapter(http);
  __resetReachability();
  wireReachability();
});

afterEach(() => {
  __resetReachability();
  setReachabilityHandler(null);
  mock.restore();
  jest.useRealTimers();
});

const probes = () => mock.history.get.filter((r) => r.url === "/up").length;

describe("reachability", () => {
  it("starts reachable — an app cannot know it is offline before it asks", () => {
    expect(useReachability.getState().reachable).toBe(true);
  });

  it("goes unreachable when a request gets no response, and probes until one answers", async () => {
    mock.onGet("/api/v1/ai/conversation").networkError();
    mock.onGet("/up").networkError();

    await http.get("/api/v1/ai/conversation").catch(() => {});
    await flush();

    expect(useReachability.getState().reachable).toBe(false);
    expect(useReachability.getState().unreachableSince).not.toBeNull();

    jest.advanceTimersByTime(PROBE_MS);
    await flush();
    expect(probes()).toBe(1);
    expect(useReachability.getState().reachable).toBe(false);

    // The server is back.
    mock.onGet("/up").reply(200, "OK");
    jest.advanceTimersByTime(PROBE_MS);
    await flush();

    expect(useReachability.getState().reachable).toBe(true);
    expect(useReachability.getState().unreachableSince).toBeNull();

    // And the probe is GONE: nothing spins once everything is fine.
    const before = probes();
    jest.advanceTimersByTime(PROBE_MS * 3);
    await flush();
    expect(probes()).toBe(before);
  });

  it("does not call a 500 offline — a server that answered was reached", async () => {
    mock.onGet("/broken").reply(500, {});

    await http.get("/broken").catch(() => {});
    await flush();

    expect(useReachability.getState().reachable).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("does not call a timeout offline — slow is not down", async () => {
    mock.onGet("/slow").timeout();

    await http.get("/slow").catch(() => {});
    await flush();

    expect(useReachability.getState().reachable).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  // The cable's `connected` calls this directly: the earliest witness after a
  // tunnel, before any HTTP has been tried.
  it("comes back on any witness and stops probing", async () => {
    mock.onGet("/gone").networkError();
    mock.onGet("/up").networkError();
    await http.get("/gone").catch(() => {});
    await flush();
    expect(useReachability.getState().reachable).toBe(false);

    useReachability.getState().markReachable();

    expect(useReachability.getState().reachable).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("leaves no timer behind after a reset", async () => {
    mock.onGet("/gone").networkError();
    await http.get("/gone").catch(() => {});
    await flush();

    __resetReachability();

    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("coming back to the app asks at once (docs/QA_FULL.md top-10 #8)", () => {
  // Measured 2026-11-07: in airplane mode the app said nothing until a send
  // failed. Now a return to the foreground probes the server even while all
  // looked well, so "Offline" shows the moment it is true.
  it("probes on every return to the foreground, and a failed probe is offline at once", async () => {
    let onChange: ((status: string) => void) | null = null;
    const { AppState } = jest.requireActual("react-native") as typeof import("react-native");
    const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_e, fn) => {
      onChange = fn as (status: string) => void;
      return { remove: jest.fn() } as never;
    });
    __resetReachability();
    wireReachability();
    mock.onGet("/up").networkError();

    expect(useReachability.getState().reachable).toBe(true);
    onChange!("active");
    await flush();

    expect(probes()).toBe(1);
    expect(useReachability.getState().reachable).toBe(false);
    spy.mockRestore();
  });
});

/**
 * BACK ONLINE, THE SCREEN RECOVERS BY ITSELF. Measured 2026-11-07 on qa_phone:
 * Pages opened in airplane mode said "Could not reach MultiMagic", and after
 * the connection came back it went on saying so until Try again was tapped.
 */
describe("reconnecting", () => {
  it("refetches the queries that failed, and only those, when MultiMagic answers again", async () => {
    const { queryClient } = jest.requireActual("@/lib/queryClient") as typeof import("@/lib/queryClient");
    const refetch = jest.spyOn(queryClient, "refetchQueries").mockResolvedValue(undefined);

    useReachability.getState().markUnreachable();
    expect(refetch).not.toHaveBeenCalled();
    useReachability.getState().markReachable();

    expect(refetch).toHaveBeenCalledTimes(1);
    const filters = refetch.mock.calls[0][0] as { type: string; predicate: (q: { state: { status: string } }) => boolean };
    expect(filters.type).toBe("active");
    expect(filters.predicate({ state: { status: "error" } })).toBe(true);
    expect(filters.predicate({ state: { status: "success" } })).toBe(false);

    // Already reachable: an answer is not a reconnection.
    useReachability.getState().markReachable();
    expect(refetch).toHaveBeenCalledTimes(1);
    refetch.mockRestore();
  });
});
