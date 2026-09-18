/**
 * The fingerprint decides whether this app can talk to multi_magic at all: a
 * mismatch makes `jwt_revoked?` treat the token as STOLEN, so every request
 * fails with nothing on screen to suggest why. None of that is visible by
 * looking at a screen, which is why it is tested here.
 */
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { __resetFingerprintCache, getDeviceFingerprint } from "../fingerprint";

const KEY = "mm_device_fp";

describe("getDeviceFingerprint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetFingerprintCache();
    (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  });

  it("mints one value and persists it, so it survives a restart", async () => {
    const fp = await getDeviceFingerprint();

    expect(fp).toBe("11111111-2222-3333-4444-555555555555");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY, fp);
  });

  it("returns the STORED value on a later launch rather than minting a new one", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce("an-older-install");

    const fp = await getDeviceFingerprint();

    expect(fp).toBe("an-older-install");
    // The decisive assertion: minting here would silently revoke the token
    // issued against the old value, locking the user out of their own account.
    expect(Crypto.randomUUID).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("reads the keystore ONCE however many callers ask", async () => {
    await getDeviceFingerprint();
    await getDeviceFingerprint();
    await getDeviceFingerprint();

    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
  });

  // ── THE RACE THAT WOULD LOCK SOMEBODY OUT ─────────────────────────────────
  //
  // At launch several requests fire at once, and each one awaits the
  // fingerprint. Without the in-flight promise, each would find an empty
  // keystore and mint its own — and the LAST write would win. The token issued
  // against the first value is then revoked by the second, which is precisely
  // the "every request rejected as a stolen token" failure.
  it("gives concurrent callers the SAME value", async () => {
    const [a, b, c] = await Promise.all([
      getDeviceFingerprint(),
      getDeviceFingerprint(),
      getDeviceFingerprint(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("still returns a usable value when the keystore cannot be read", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error("no keystore"));

    // A fresh fingerprint costs a re-login, which is recoverable. Throwing here
    // would crash the app on launch, which is not.
    await expect(getDeviceFingerprint()).resolves.toBe("11111111-2222-3333-4444-555555555555");
  });

  it("still returns a usable value when the keystore cannot be written", async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error("disk full"));

    await expect(getDeviceFingerprint()).resolves.toBe("11111111-2222-3333-4444-555555555555");
  });
});
