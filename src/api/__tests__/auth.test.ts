/**
 * Sign in and out. The JWT arrives in a HEADER, 2FA arrives as a 202 that axios
 * treats as success, and the fingerprint must survive a logout.
 */
import MockAdapter from "axios-mock-adapter";
import * as SecureStore from "expo-secure-store";
import {
  MissingTokenError, TwoFactorRequiredError, signIn, signOut,
} from "../auth";
import { __resetTokenCache, http, loadSessionEmail, loadToken } from "../http";
import { __resetFingerprintCache, getDeviceFingerprint } from "@/lib/fingerprint";

let mock: MockAdapter;

const USER = {
  id: 2,
  email: "person@example.com",
  firstname: "Hamma",
  lastname: null,
  fullname: "Hamma",
};

beforeEach(() => {
  mock = new MockAdapter(http);
  jest.clearAllMocks();
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

describe("signIn", () => {
  it("takes the token from the Authorization HEADER and stores it verbatim", async () => {
    mock.onPost("/users/login").reply(200, USER, { authorization: "Bearer eyJ.a.b" });

    const user = await signIn({ email: "person@example.com", password: "a-real-password" });

    expect(user.id).toBe(2);
    // Stored before returning, so the caller cannot forget to.
    expect(await loadToken()).toBe("Bearer eyJ.a.b");
  });

  it("posts the credentials under `user`, as devise expects", async () => {
    mock.onPost("/users/login").reply(200, USER, { authorization: "Bearer t" });

    await signIn({ email: "  person@example.com  ", password: "pw" });

    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      user: { email: "person@example.com", password: "pw" },
    });
  });

  // ── THE 202 THAT LOOKS LIKE SUCCESS ───────────────────────────────────────
  //
  // His account has 2FA off, so no OTP screen ships. But 202 is a SUCCESS
  // status and axios resolves it, so without this branch `signIn` would return
  // normally having stored nothing — a login screen that accepts the password
  // and does nothing, with no reason for the user to think anything went wrong.
  it("throws a NAMED error when the account needs an emailed code", async () => {
    mock.onPost("/users/login").reply(
      202,
      { two_factor_required: true, pre_auth_token: "pre-auth-123" },
      // The header is present but its JWT is already revoked on this path.
      { authorization: "Bearer revoked" },
    );

    const error = await signIn({ email: "x@y.z", password: "pw" }).catch((e) => e);

    expect(error).toBeInstanceOf(TwoFactorRequiredError);
    expect((error as TwoFactorRequiredError).preAuthToken).toBe("pre-auth-123");
    // Decisive: the revoked token must NOT have been stored.
    expect(await loadToken()).toBeNull();
  });

  it("throws rather than reporting success when no token comes back", async () => {
    mock.onPost("/users/login").reply(200, USER);

    await expect(signIn({ email: "x@y.z", password: "pw" })).rejects.toBeInstanceOf(
      MissingTokenError,
    );
    expect(await loadToken()).toBeNull();
  });

  // The cable finds the user BY EMAIL. Storing what was typed rather than what
  // the server returned would build a socket URL that matches nobody while
  // every HTTP request kept working — a half-broken session that reads as a
  // socket bug.
  it("stores the SERVER's spelling of the address, not the field's", async () => {
    mock.onPost("/users/login").reply(200, USER, { authorization: "Bearer t" });

    await signIn({ email: "  PERSON@Example.com  ", password: "pw" });

    expect(await loadSessionEmail()).toBe("person@example.com");
  });
});

describe("signOut", () => {
  it("clears the token and the email", async () => {
    mock.onPost("/users/login").reply(200, USER, { authorization: "Bearer t" });
    await signIn({ email: "person@example.com", password: "pw" });
    mock.onDelete("/users/logout").reply(204);

    await signOut();

    expect(await loadToken()).toBeNull();
    expect(await loadSessionEmail()).toBeNull();
  });

  it("logs this device out even when the server cannot be reached", async () => {
    mock.onPost("/users/login").reply(200, USER, { authorization: "Bearer t" });
    await signIn({ email: "person@example.com", password: "pw" });
    mock.onDelete("/users/logout").networkError();

    await expect(signOut()).resolves.toBeUndefined();
    expect(await loadToken()).toBeNull();
  });

  // ── THE FINGERPRINT SURVIVES ──────────────────────────────────────────────
  //
  // multi_magic's own fingerprint module says clearing it "would cause a
  // re-authentication cycle if a user clears and re-logs in the same browser".
  // Same phone, same consequence.
  it("does NOT clear the device fingerprint", async () => {
    const before = await getDeviceFingerprint();
    mock.onDelete("/users/logout").reply(204);

    await signOut();

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalledWith("mm_device_fp");
    __resetFingerprintCache();
    expect(await getDeviceFingerprint()).toBe(before);
  });
});
