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
