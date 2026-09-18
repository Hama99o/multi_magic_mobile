/**
 * The AI key boundary.
 *
 * Two things are worth a test here and they are both about what does NOT
 * happen: the key never comes back, and a refusal is the provider's sentence
 * rather than ours.
 */
import MockAdapter from "axios-mock-adapter";
import { aiKeysApi, parseKeyPayload, KeyRefused } from "../aiKeys";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

function payload(extra: object = {}) {
  return {
    ai_keys: [
      {
        id: 3,
        provider: "gemini",
        masked: "AIza…9f2a",
        active: true,
        verified: true,
        verified_at: "2026-09-18T10:00:00Z",
        verification_error: null,
        shared_with: [],
      },
    ],
    providers: ["gemini", "deepseek", "gpt"],
    borrowed: [],
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

describe("the key itself", () => {
  it("never arrives — only the mask does", async () => {
    mock.onGet("/api/v1/ai_keys").reply(200, payload());

    const { keys } = await aiKeysApi.list();

    expect(keys[0].masked).toBe("AIza…9f2a");
    expect(keys[0]).not.toHaveProperty("apiKey");
    expect(keys[0]).not.toHaveProperty("api_key");
  });

  it("goes UP under the nested ai_key param the server expects", async () => {
    mock.onPost("/api/v1/ai_keys").reply(201, payload());

    await aiKeysApi.add("gemini", "AIzaSyTEST");

    expect(JSON.parse(mock.history.post[0].data)).toEqual({
      ai_key: { provider: "gemini", api_key: "AIzaSyTEST" },
    });
  });
});

// ── THE REFUSAL IS THE PROVIDER'S SENTENCE ──────────────────────────────────
describe("a key the provider refuses", () => {
  it("surfaces the provider's own wording, not ours", async () => {
    // `render json: { message: [verdict.message], provider: … }` — an ARRAY.
    mock.onPost("/api/v1/ai_keys").reply(422, {
      message: ["API key not valid. Please pass a valid API key."],
      provider: "gemini",
    });

    await expect(aiKeysApi.add("gemini", "nope")).rejects.toThrow(
      "API key not valid. Please pass a valid API key.",
    );
    await expect(aiKeysApi.add("gemini", "nope")).rejects.toBeInstanceOf(KeyRefused);
  });

  it("is told apart from a transport failure, because the advice differs", async () => {
    mock.onPost("/api/v1/ai_keys").networkError();

    // "check what you pasted" vs "try again in a moment" are opposite answers,
    // and only one of them is the user's fault.
    await expect(aiKeysApi.add("gemini", "AIzaSy")).rejects.not.toBeInstanceOf(KeyRefused);
  });
});

// ── THE SHAPE THAT WENT BLANK ONCE ──────────────────────────────────────────
describe("every action answers with the whole payload", () => {
  it("keeps `providers` on a CREATE, which is what went blank on first use", async () => {
    mock.onPost("/api/v1/ai_keys").reply(201, payload());

    const result = await aiKeysApi.add("gemini", "AIzaSyTEST");

    // The controller's comment: caching a mutation's response that lacked the
    // provider list made "the whole section go blank on first use".
    expect(result.providers).toEqual(["gemini", "deepseek", "gpt"]);
  });

  it("keeps it on a DELETE too, which also promotes a new active key", async () => {
    mock.onDelete("/api/v1/ai_keys/3").reply(200, payload({ ai_keys: [] }));

    const result = await aiKeysApi.remove(3);

    expect(result.keys).toEqual([]);
    expect(result.providers).toHaveLength(3);
  });

  it("activates through PUT on the member route", async () => {
    mock.onPut("/api/v1/ai_keys/3/activate").reply(200, payload());

    await aiKeysApi.activate(3);

    expect(mock.history.put[0].url).toBe("/api/v1/ai_keys/3/activate");
  });
});

describe("providers", () => {
  it("come from the server and are never assumed", () => {
    const parsed = parseKeyPayload(payload({ providers: ["only-this-one"] }));
    expect(parsed.providers).toEqual(["only-this-one"]);
  });

  it("survive a response that omits them, as an empty list rather than a throw", () => {
    // A missing list means "offer nothing", which renders as "you already have
    // a key for every provider" — wrong, but not a crash over somebody's
    // settings screen.
    const parsed = parseKeyPayload({ ai_keys: [], borrowed: [] });
    expect(parsed.providers).toEqual([]);
  });
});

describe("a key lent to you", () => {
  it("is rendered as provider and owner, with no mask and no last four", () => {
    const parsed = parseKeyPayload(
      payload({ borrowed: [{ provider: "gemini", owner_name: "Hamid" }] }),
    );
    expect(parsed.borrowed).toEqual([{ provider: "gemini", ownerName: "Hamid" }]);
    expect(JSON.stringify(parsed.borrowed)).not.toContain("masked");
  });
});
