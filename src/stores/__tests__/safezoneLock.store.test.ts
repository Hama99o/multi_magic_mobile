/**
 * The vault's lock state (`docs/design/safezone/SECURITY.md` §2–§4): memory
 * only, the server's expiry, the server's lockout, and every way it locks.
 */
import MockAdapter from "axios-mock-adapter";
import { useSafezoneLock, onSafezoneLock } from "../safezoneLock.store";
import { safezoneApi } from "@/api/safezone";
import { http } from "@/api/http";

const T0 = 1_800_000_000_000;

beforeEach(() => useSafezoneLock.getState().reset());

describe("the lock store", () => {
  it("starts unknown, holding no token", () => {
    expect(useSafezoneLock.getState()).toMatchObject({ status: { kind: "unknown" }, token: null, expiresAt: null });
  });

  it("follows the server's PIN status", () => {
    const s = useSafezoneLock.getState();
    s.fromPinStatus({ enabled: false, lockedOut: false, lockedUntil: null, attemptsLeft: 5 });
    expect(useSafezoneLock.getState().status).toEqual({ kind: "notEnabled" });
    s.fromPinStatus({ enabled: true, lockedOut: false, lockedUntil: null, attemptsLeft: 4 });
    expect(useSafezoneLock.getState().status).toEqual({ kind: "locked", attemptsLeft: 4 });
    s.fromPinStatus({ enabled: true, lockedOut: true, lockedUntil: "2026-11-13T21:47:00Z", attemptsLeft: 0 });
    expect(useSafezoneLock.getState().status).toEqual({ kind: "lockedOut", until: "2026-11-13T21:47:00Z" });
  });

  it("unlocks with the server's expiry and no other", () => {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 }, T0);
    const s = useSafezoneLock.getState();
    expect(s.status).toEqual({ kind: "unlocked" });
    expect(s.token).toBe("tok");
    expect(s.expiresAt).toBe(T0 + 120_000);
    expect(s.liveToken(T0 + 119_999)).toBe("tok");
    expect(s.liveToken(T0 + 120_000)).toBeNull();
  });

  it("asks for a refresh only past half the token's life", () => {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 }, T0);
    const s = useSafezoneLock.getState();
    expect(s.needsRefresh(T0 + 59_000)).toBe(false);
    expect(s.needsRefresh(T0 + 61_000)).toBe(true);
    expect(s.needsRefresh(T0 + 121_000)).toBe(false); // expired: a full unlock, not a refresh
  });

  it("an expired token locks the vault when checked", () => {
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 }, T0);
    useSafezoneLock.getState().expireIfDue(T0 + 120_000);
    expect(useSafezoneLock.getState()).toMatchObject({ status: { kind: "locked" }, token: null });
  });

  it("lock() drops the token, bumps the epoch and tells every listener", () => {
    const heard = jest.fn();
    const off = onSafezoneLock(heard);
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 }, T0);
    const epoch = useSafezoneLock.getState().lockEpoch;
    useSafezoneLock.getState().lock();
    expect(useSafezoneLock.getState()).toMatchObject({ token: null, expiresAt: null, status: { kind: "locked" } });
    expect(useSafezoneLock.getState().lockEpoch).toBe(epoch + 1);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    useSafezoneLock.getState().lock();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("lock() on a vault with no PIN does not pretend it has one", () => {
    useSafezoneLock.getState().fromPinStatus({ enabled: false, lockedOut: false, lockedUntil: null, attemptsLeft: 5 });
    useSafezoneLock.getState().lock();
    expect(useSafezoneLock.getState().status).toEqual({ kind: "notEnabled" });
  });

  it("a wrong PIN and a lockout are the server's numbers", () => {
    useSafezoneLock.getState().wrongPin(2);
    expect(useSafezoneLock.getState().status).toEqual({ kind: "locked", attemptsLeft: 2 });
    useSafezoneLock.getState().lockedOut("2026-11-13T21:47:00Z");
    expect(useSafezoneLock.getState().status).toEqual({ kind: "lockedOut", until: "2026-11-13T21:47:00Z" });
  });

  it("a 403 safezone_pin_locked from the API locks the vault", async () => {
    const mock = new MockAdapter(http);
    useSafezoneLock.getState().unlocked({ token: "tok", expiresIn: 120 }, Date.now());
    mock.onGet("/api/v1/safezone_app/passwords").reply(403, { error: "safezone_pin_locked" });
    await expect(safezoneApi.list("passwords", { token: "tok" })).rejects.toMatchObject({ kind: "locked" });
    expect(useSafezoneLock.getState()).toMatchObject({ token: null, status: { kind: "locked" } });
    mock.restore();
  });

  it("is not persisted (no storage middleware)", () => {
    expect((useSafezoneLock as unknown as { persist?: unknown }).persist).toBeUndefined();
  });
});
