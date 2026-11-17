/**
 * The account-area clients against the server's real shapes
 * (`docs/design/profile-parity/MANIFEST.md`): what each sends, and how each
 * refusal is told apart. Bodies are taken from the controllers named in each
 * client's header.
 */
import MockAdapter from "axios-mock-adapter";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { WrongCurrentPassword } from "../profile";
import { EmailChangeRefused, securityApi } from "../security";
import { developerApi } from "../developer";
import { followsApi } from "../follows";
import { aiKeysApi, KeyRefused } from "../aiKeys";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});
afterEach(() => mock.restore());

const body = (i = 0) => JSON.parse(mock.history.post[i]?.data ?? mock.history.delete[i]?.data ?? "{}");

describe("two-step sign-in", () => {
  it("sends the current password and reads a wrong one by its code, not its sentence", async () => {
    mock.onPost("/api/v1/two_factor/enable").reply(422, { message: "Le mot de passe actuel est incorrect", code: "wrong_current_password" });
    await expect(securityApi.setTwoFactor(true, "typo")).rejects.toBeInstanceOf(WrongCurrentPassword);
    expect(body()).toEqual({ current_password: "typo" });
  });

  it("turns it off with a DELETE carrying the password", async () => {
    mock.onDelete("/api/v1/two_factor/disable").reply(200, { message: "ok" });
    await securityApi.setTwoFactor(false, "pw");
    expect(JSON.parse(mock.history.delete[0].data)).toEqual({ current_password: "pw" });
  });
});

describe("devices", () => {
  it("reads sessions, marking the current one", async () => {
    mock.onGet("/api/v1/active_sessions").reply(200, {
      sessions: [{ id: 1, device_label: "Pixel", ip_address: "1.2.3.4", aud: null, created_at: "2026-11-17T08:00:00Z", exp: 1800000000, is_current: true }],
    });
    const [s] = await securityApi.sessions();
    expect(s).toMatchObject({ id: 1, deviceLabel: "Pixel", isCurrent: true });
    expect(s.expiresAt).toBe(new Date(1800000000 * 1000).toISOString());
  });

  it("reads a page of trusted devices with the next page from pagy", async () => {
    mock.onGet("/api/v1/trusted_devices").reply(200, {
      trusted_devices: [{ id: 5, label: "iPad", last_used_at: null, expires_at: null, created_at: null }, { broken: true }],
      meta: { pagy: { page: 1, next: 2 }, total_count: 11 },
    });
    const page = await securityApi.trustedDevices(1);
    expect(page).toMatchObject({ page: 1, next: 2, total: 11, unreadable: 1 });
    expect(mock.history.get[0].params).toEqual({ page: 1 });
  });
});

describe("email change", () => {
  it("maps each refusal to its own error", async () => {
    mock.onPost("/api/v1/users/me/email_change").replyOnce(422, { code: "wrong_current_password" });
    await expect(securityApi.requestEmailChange("x", "a@b.co")).rejects.toBeInstanceOf(WrongCurrentPassword);
    mock.onPost("/api/v1/users/me/email_change").replyOnce(422, { code: "email_taken" });
    await expect(securityApi.requestEmailChange("x", "a@b.co")).rejects.toMatchObject({ code: "email_taken" });
    mock.onPost("/api/v1/users/me/email_change/confirm").replyOnce(422, { code: "invalid_code", attempts_left: 3 });
    const refused = await securityApi.confirmEmailChange("000000").catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(EmailChangeRefused);
    expect(refused).toMatchObject({ code: "invalid_code", attemptsLeft: 3 });
  });

  it("answers the confirm with the new address", async () => {
    mock.onPost("/api/v1/users/me/email_change/confirm").reply(200, { user: { id: 8, email: "new@b.co" } });
    await expect(securityApi.confirmEmailChange("123456")).resolves.toEqual({ email: "new@b.co" });
  });
});

describe("API keys", () => {
  it("returns the token from the create answer, and only from it", async () => {
    mock.onPost("/api/v1/api_keys").reply(201, {
      api_key: { id: 3, name: "Bot", active: true, scopes: ["read"], last_used_at: null, expires_at: null, created_at: null, token: "fa_secret" },
    });
    mock.onGet("/api/v1/api_keys").reply(200, {
      api_keys: [{ id: 3, name: "Bot", active: true, scopes: ["read"], last_used_at: null, expires_at: null, created_at: null, token: "fa_••••cret" }],
    });
    const made = await developerApi.createApiKey("Bot", ["read"], null);
    expect(made.token).toBe("fa_secret");
    expect(body()).toEqual({ api_key: { name: "Bot", scopes: ["read"] } });
    const [listed] = await developerApi.apiKeys();
    expect(listed).not.toHaveProperty("token");
    expect(listed.masked).toBe("fa_••••cret");
  });
});

describe("follows", () => {
  it("sends the followed id flat AND nested, so it works before and after the server fix", async () => {
    mock.onPost("/api/v1/follows/follow").reply(200, {});
    await followsApi.follow(42);
    expect(body()).toEqual({ followed_id: 42, follow: { followed_id: 42 } });
  });
});

describe("lending a key", () => {
  it("sends the email and the limit, blank for none, and shows the server's refusal", async () => {
    mock.onPost("/api/v1/ai_keys/3/share").replyOnce(422, { error: "You cannot share a key with yourself." });
    await expect(aiKeysApi.lend(3, "me@b.co", null)).rejects.toEqual(new KeyRefused("You cannot share a key with yourself."));
    expect(body()).toEqual({ email: "me@b.co", monthly_credit_limit: "" });
  });
});
