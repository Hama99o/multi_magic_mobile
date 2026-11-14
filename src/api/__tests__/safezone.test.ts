/**
 * SafeZone at the HTTP layer (`docs/design/safezone/SECURITY.md`), in the
 * server's own shapes: `Api::V1::SafezoneApp::*`, the three serializers and
 * their `:masked` view, `SafezonePinGuard`, read 2026-11-13.
 *
 * The deployed server sends plaintext secrets in every list; these tests
 * feed it exactly that and require that nothing secret comes out.
 */
import MockAdapter from "axios-mock-adapter";
import {
  safezoneApi,
  SafeZoneError,
  setSafezoneLockedHandler,
  stripSecrets,
  SECRET_FIELDS,
} from "../safezone";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
  setSafezoneLockedHandler(null);
});
afterEach(() => mock.restore());

const BASE = "/api/v1/safezone_app";
const pagy = (pages = 1, count = 1) => ({ pagy: { pages, page: 1, count } });

/** What the DEPLOYED server answers today: plaintext in the list. */
const plaintextPassword = {
  id: 11, title: "Mail", username: "qa-user", email: "qa@example.test", link: "https://mail.example.test",
  status: "published", updated_at: "2026-11-10T10:00:00Z", note: "work", password: "hunter2-very-secret",
  owner: { id: 1 },
};
const plaintextCard = {
  id: 21, name: "Visa", card_type: "credit_card", card_number: "4111 1111 1111 4242", expiry_date: "12/29",
  cvv: "987", code: "5555", status: "published", note: null, updated_at: "2026-11-09T10:00:00Z", owner: { id: 1 },
};
const plaintextIdentity = {
  id: 31, type: "passport", document_number: "P12345678", issued_at: "2020-01-01", expires_at: "2030-01-01",
  image: null, note: null, created_at: "2020-01-02T00:00:00Z", updated_at: "2026-11-08T10:00:00Z", user: { id: 1 },
};

const SECRETS = ["hunter2-very-secret", "4111 1111 1111 4242", "987", "5555", "P12345678"];
function holdsNoSecret(value: unknown) {
  const text = JSON.stringify(value);
  for (const s of SECRETS) expect(text).not.toContain(s);
  for (const field of ["password", "card_number", "cvv", "code", "document_number"]) {
    expect(text).not.toMatch(new RegExp(`"${field}"`));
  }
}

describe("lists: the phone masks, whatever the server sends", () => {
  it("asks for ?masked=1 and sends the unlock token", async () => {
    mock.onGet(`${BASE}/passwords`).reply((config) => {
      expect(config.params).toMatchObject({ masked: 1, page: 2, search: "mail" });
      expect(config.headers?.["X-Safezone-Unlock"]).toBe("tok-1");
      return [200, { passwords: [], meta: pagy(3, 0) }];
    });
    const page = await safezoneApi.list("passwords", { token: "tok-1", page: 2, search: "mail" });
    expect(page).toMatchObject({ rows: [], page: 2, pages: 3 });
  });

  it("a plaintext password list comes out with no secret in it", async () => {
    mock.onGet(`${BASE}/passwords`).reply(200, { passwords: [plaintextPassword], meta: pagy() });
    const page = await safezoneApi.list("passwords", { token: "t" });
    holdsNoSecret(page);
    expect(page.rows[0]).toEqual({
      kind: "passwords", id: 11, title: "Mail", username: "qa-user", email: "qa@example.test",
      link: "https://mail.example.test", weak: null, updatedAt: "2026-11-10T10:00:00Z",
    });
  });

  it("a plaintext card list keeps only the last four, computed on the phone", async () => {
    mock.onGet(`${BASE}/payment_cards`).reply(200, { payment_cards: [plaintextCard], meta: pagy() });
    const page = await safezoneApi.list("payment_cards", { token: "t" });
    holdsNoSecret(page);
    expect(page.rows[0]).toEqual({
      kind: "payment_cards", id: 21, name: "Visa", cardType: "credit_card", expiry: "12/29", last4: "4242",
      updatedAt: "2026-11-09T10:00:00Z",
    });
  });

  it("a plaintext identity list keeps only the last four", async () => {
    mock.onGet(`${BASE}/identities`).reply(200, { identities: [plaintextIdentity], meta: pagy() });
    const page = await safezoneApi.list("identities", { token: "t" });
    holdsNoSecret(page);
    expect(page.rows[0]).toEqual({
      kind: "identities", id: 31, type: "passport", last4: "5678", issuedAt: "2020-01-01",
      expiresAt: "2030-01-01", updatedAt: "2026-11-08T10:00:00Z",
    });
  });

  it("reads the masked view's own facts when the server has PR #19", async () => {
    mock.onGet(`${BASE}/passwords`).reply(200, {
      passwords: [{ ...plaintextPassword, password: null, password_weak: true }], meta: pagy(),
    });
    mock.onGet(`${BASE}/payment_cards`).reply(200, {
      payment_cards: [{ ...plaintextCard, card_number: null, cvv: null, code: null, card_last4: "1881" }], meta: pagy(),
    });
    expect((await safezoneApi.list("passwords", { token: "t" })).rows[0]).toMatchObject({ weak: true });
    expect((await safezoneApi.list("payment_cards", { token: "t" })).rows[0]).toMatchObject({ last4: "1881" });
  });

  it("a short secret gives no last four (nothing to hint from)", () => {
    expect(stripSecrets("identities", { ...plaintextIdentity, document_number: "123" })).toMatchObject({ last4: null });
  });

  it("names every secret field the server has", () => {
    expect(SECRET_FIELDS).toEqual({
      passwords: ["password"],
      payment_cards: ["card_number", "cvv", "code"],
      identities: ["document_number"],
    });
  });
});

describe("the item: secrets on demand", () => {
  it("returns every field in order, the secret ones marked", async () => {
    mock.onGet(`${BASE}/payment_cards/21`).reply((config) => {
      expect(config.headers?.["X-Safezone-Unlock"]).toBe("tok");
      return [200, plaintextCard];
    });
    const item = await safezoneApi.show("payment_cards", 21, "tok");
    expect(item.title).toBe("Visa");
    expect(item.fields.map((f) => [f.key, f.secret])).toEqual([
      ["card_type", false],
      ["card_number", true],
      ["expiry_date", false],
      ["cvv", true],
      ["code", true],
    ]);
    expect(item.fields.find((f) => f.key === "cvv")?.value).toBe("987");
  });

  it("drops empty fields, and a password's site is a link", async () => {
    mock.onGet(`${BASE}/passwords/11`).reply(200, { ...plaintextPassword, email: "", note: null });
    const item = await safezoneApi.show("passwords", 11, "tok");
    expect(item.fields.map((f) => f.key)).toEqual(["username", "password", "link"]);
    expect(item.fields.find((f) => f.key === "link")?.link).toBe(true);
  });
});

describe("the PIN", () => {
  it("unlock posts the PIN in the BODY, never the URL, and returns only the token", async () => {
    mock.onPost(`${BASE}/pin/unlock`).reply((config) => {
      expect(config.url).not.toMatch(/\d{6}/);
      expect(JSON.parse(config.data as string)).toEqual({ pin: "482913" });
      return [200, { unlock_token: "signed", expires_in: 120 }];
    });
    expect(await safezoneApi.unlock("482913")).toEqual({ token: "signed", expiresIn: 120 });
  });

  it("refresh sends the current token and returns the next", async () => {
    mock.onPost(`${BASE}/pin/refresh`).reply((config) => {
      expect(config.headers?.["X-Safezone-Unlock"]).toBe("old");
      return [200, { unlock_token: "new", expires_in: 120 }];
    });
    expect(await safezoneApi.refresh("old")).toEqual({ token: "new", expiresIn: 120 });
  });

  it("reads the status", async () => {
    mock.onGet(`${BASE}/pin`).reply(200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 });
    expect(await safezoneApi.pinStatus()).toEqual({ enabled: true, lockedOut: false, lockedUntil: null, attemptsLeft: 5 });
  });

  it("enable sends the account password and the pair", async () => {
    mock.onPost(`${BASE}/pin/enable`).reply((config) => {
      expect(JSON.parse(config.data as string)).toEqual({ current_password: "pw", pin: "123456", pin_confirmation: "123456" });
      return [200, { enabled: true, locked_out: false, locked_until: null, attempts_left: 5 }];
    });
    expect((await safezoneApi.enable({ currentPassword: "pw", pin: "123456", pinConfirmation: "123456" })).enabled).toBe(true);
  });

  it("logs nothing of the PIN, the token or a secret", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((k) => jest.spyOn(console, k).mockImplementation(() => {}));
    mock.onPost(`${BASE}/pin/unlock`).reply(403, { error: "wrong_pin", attempts_left: 2 });
    mock.onGet(`${BASE}/passwords/11`).reply(200, plaintextPassword);
    await safezoneApi.unlock("482913").catch(() => {});
    await safezoneApi.show("passwords", 11, "tok-secret");
    const said = spies.flatMap((s) => s.mock.calls.flat().map(String)).join("\n");
    expect(said).not.toContain("482913");
    expect(said).not.toContain("tok-secret");
    expect(said).not.toContain("hunter2");
    spies.forEach((s) => s.mockRestore());
  });
});

describe("the server's refusals, typed", () => {
  async function refusal(status: number, body: unknown): Promise<SafeZoneError> {
    mock.onPost(`${BASE}/pin/unlock`).reply(status, body);
    try {
      await safezoneApi.unlock("000000");
    } catch (e) {
      return e as SafeZoneError;
    }
    throw new Error("did not refuse");
  }

  it("wrong PIN carries the server's attempts left", async () => {
    const e = await refusal(403, { error: "wrong_pin", attempts_left: 3 });
    expect(e).toBeInstanceOf(SafeZoneError);
    expect(e).toMatchObject({ kind: "wrongPin", attemptsLeft: 3 });
  });

  it("423 is the lockout, with the server's time", async () => {
    expect(await refusal(423, { error: "pin_locked_out", locked_until: "2026-11-13T21:47:00Z" }))
      .toMatchObject({ kind: "lockedOut", lockedUntil: "2026-11-13T21:47:00Z" });
  });

  it("422 pin_not_enabled, 429, invalid password, mismatch, format", async () => {
    expect(await refusal(422, { error: "pin_not_enabled" })).toMatchObject({ kind: "notEnabled" });
    expect(await refusal(429, {})).toMatchObject({ kind: "rateLimited" });
    expect(await refusal(403, { error: "invalid_password" })).toMatchObject({ kind: "invalidPassword" });
    expect(await refusal(422, { error: "pin_mismatch" })).toMatchObject({ kind: "pinMismatch" });
    expect(await refusal(422, { error: "invalid_pin_format" })).toMatchObject({ kind: "invalidFormat" });
  });

  it("403 safezone_pin_locked anywhere calls the lock handler", async () => {
    const onLocked = jest.fn();
    setSafezoneLockedHandler(onLocked);
    mock.onGet(`${BASE}/identities`).reply(403, { error: "safezone_pin_locked" });
    await expect(safezoneApi.list("identities", { token: "stale" })).rejects.toMatchObject({ kind: "locked" });
    expect(onLocked).toHaveBeenCalledTimes(1);
  });

  it("a network failure is not a SafeZone refusal", async () => {
    mock.onGet(`${BASE}/identities`).networkError();
    const onLocked = jest.fn();
    setSafezoneLockedHandler(onLocked);
    await expect(safezoneApi.list("identities", { token: "t" })).rejects.not.toBeInstanceOf(SafeZoneError);
    expect(onLocked).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("is a hard DELETE with the token", async () => {
    mock.onDelete(`${BASE}/passwords/11`).reply((config) => {
      expect(config.headers?.["X-Safezone-Unlock"]).toBe("tok");
      return [204];
    });
    await safezoneApi.remove("passwords", 11, "tok");
  });
});
