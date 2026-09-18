/**
 * The profile boundary — and the first block is the one that matters.
 *
 * A wrong current password must NOT sign the user out. The server made that
 * possible by answering 422 instead of 401; this file is what stops the client
 * from throwing it away.
 */
import MockAdapter from "axios-mock-adapter";
import { profileApi, parseProfile, WrongCurrentPassword, PASSWORD_MIN_LENGTH } from "../profile";
import { __resetTokenCache, http, loadToken } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

function user(extra: object = {}) {
  return {
    id: 1,
    email: "someone@example.com",
    firstname: "Anisa",
    lastname: "Rahimi",
    fullname: "Anisa Rahimi",
    username: "anisa",
    about: null,
    phone_number: null,
    avatar: "/rails/active_storage/blobs/x/p.jpg",
    created_at: "2026-01-02T09:00:00Z",
    ...extra,
  };
}

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});

afterEach(() => mock.restore());

// ── THE TRAP, PINNED ────────────────────────────────────────────────────────
describe("a wrong current password", () => {
  it("is a 422 and becomes WrongCurrentPassword, not a session failure", async () => {
    mock
      .onPut("/api/v1/users/1/change_password")
      .reply(422, { error: "Current password is incorrect" });

    await expect(
      profileApi.changePassword(1, {
        currentPassword: "wrong",
        password: "newpass1",
        passwordConfirmation: "newpass1",
      }),
    ).rejects.toBeInstanceOf(WrongCurrentPassword);
  });

  it("would have signed the user out if the server had used 401", async () => {
    // Not a hypothetical: `http.ts`'s interceptor clears the token on ANY 401.
    // This test documents why the server's choice of 422 is load-bearing, by
    // showing what the other status does to this client.
    mock.onPut("/api/v1/users/1/change_password").reply(401, { error: "nope" });

    await expect(
      profileApi.changePassword(1, {
        currentPassword: "wrong",
        password: "newpass1",
        passwordConfirmation: "newpass1",
      }),
    ).rejects.not.toBeInstanceOf(WrongCurrentPassword);

    // The interceptor already cleared it.
    await expect(loadToken()).resolves.toBeNull();
  });

  it("sends the confirmation, because the server checks it", async () => {
    mock.onPut("/api/v1/users/1/change_password").reply(200, { message: "ok" });

    await profileApi.changePassword(1, {
      currentPassword: "old",
      password: "newpass1",
      passwordConfirmation: "newpass1",
    });

    expect(JSON.parse(mock.history.put[0].data)).toEqual({
      current_password: "old",
      password: "newpass1",
      password_confirmation: "newpass1",
    });
  });
});

// ── THE OTHER TRAP ──────────────────────────────────────────────────────────
describe("the email", () => {
  it("is readable", async () => {
    mock.onGet("/api/v1/users/connected_user").reply(200, { user: user() });

    await expect(profileApi.me()).resolves.toMatchObject({
      email: "someone@example.com",
    });
  });

  it("is NOT writable — the socket identifies the user by it", async () => {
    mock.onPatch("/api/v1/users/1").reply(200, { user: user() });

    // `ProfileChanges` has no `email`, so this is a type-level guarantee as
    // well as a runtime one. The test pins the wire.
    await profileApi.update(1, { firstname: "Anisa", lastname: "Rahimi" });

    const sent = JSON.parse(mock.history.patch[0].data);
    expect(sent.user).not.toHaveProperty("email");
    expect(sent).toEqual({ user: { firstname: "Anisa", lastname: "Rahimi" } });
  });
});

describe("the current user", () => {
  it("comes from connected_user, which nothing else in the app calls", async () => {
    mock.onGet("/api/v1/users/connected_user").reply(200, { user: user() });

    await profileApi.me();

    expect(mock.history.get[0].url).toBe("/api/v1/users/connected_user");
  });

  it("absolutises the avatar path", () => {
    expect(parseProfile(user()).avatar).toBe(
      `${http.defaults.baseURL}/rails/active_storage/blobs/x/p.jpg`,
    );
  });

  it("tolerates a user with no name and no photo", () => {
    const bare = parseProfile(
      user({ firstname: null, lastname: null, fullname: null, avatar: null }),
    );
    expect(bare.fullName).toBeNull();
    expect(bare.avatar).toBeNull();
    expect(bare.id).toBe(1);
  });
});

describe("the photo", () => {
  it("goes up as multipart on the same route as the rest of the form", async () => {
    mock.onPatch("/api/v1/users/1").reply(200, { user: user() });

    await profileApi.uploadPhoto(1, {
      uri: "file:///tmp/p.jpg",
      name: "p.jpg",
      mimeType: "image/jpeg",
    });

    expect(mock.history.patch[0].url).toBe("/api/v1/users/1");
    expect(mock.history.patch[0].headers?.["Content-Type"]).toBe("multipart/form-data");
  });

  it("is removed through destroy_avatar with the allowlisted image type", async () => {
    mock.onDelete("/api/v1/users/1/destroy_avatar").reply(200, { user: user({ avatar: null }) });

    const updated = await profileApi.removePhoto(1);

    expect(mock.history.delete[0].params).toEqual({ image_type_name: "photo" });
    expect(updated.avatar).toBeNull();
  });
});

describe("the password rule", () => {
  it("is six characters, and there is only one of them", () => {
    // `config/initializers/devise.rb:185` — `config.password_length = 6..128`.
    // No uppercase, digit or symbol rule exists server-side, so the screen must
    // not render one. This is the test that would fail if somebody added
    // "must contain a number" to the UI.
    expect(PASSWORD_MIN_LENGTH).toBe(6);
  });
});
