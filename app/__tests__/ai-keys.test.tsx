/**
 * THE KEY SCREEN'S TWO FAILURE STATES, WHICH ARE NOT THE SAME FAILURE.
 *
 * `qa/UNWALKED.md` §3 — `ai-keys-error` and `ai-keys-borrowed` were named by no
 * flow and no test. `16-ai-keys` reaches this screen and photographs it, and
 * the register is explicit about why it stops there: **a real key is a real
 * provider credential and a real bill.** So nothing may add, replace or remove
 * one on a device, and every state behind those actions is reachable only here.
 *
 * ── WHY THE DISTINCTION IS THE POINT ──────────────────────────────────────
 * The screen makes a promise in its own intro, asserted word for word by
 * `16-ai-keys`: *"the key is checked with the provider before it is saved, and
 * it is never shown again afterwards."* Checking with the provider means there
 * are TWO ways to fail, and they are not interchangeable:
 *
 *   - **the provider refused the key** — their words, about this key, and the
 *     person can act on them by pasting a different one;
 *   - **the request failed** — ours, about the network or the server, and the
 *     key may be perfectly good.
 *
 * Collapsing them tells somebody their working key is bad, or that a dead key
 * is merely unreachable. `onError` branches on `KeyRefused` for exactly this,
 * and nothing had ever held the branch.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

/* eslint-disable import/first */
import { KeyRefused, aiKeysApi, type AiKeyPayload } from "@/api/aiKeys";
import type { BorrowedKey } from "@/api/aiKeys";
import AiKeys from "../ai-keys";

const payload = (over: Partial<AiKeyPayload> = {}): AiKeyPayload => ({
  keys: [],
  providers: ["openai", "gemini"],
  borrowed: [],
  ...over,
});

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <AiKeys />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

async function pasteAndSave(key = "sk-whatever") {
  await waitFor(() => expect(screen.getByTestId("ai-provider-openai")).toBeTruthy());
  fireEvent.press(screen.getByTestId("ai-provider-openai"));
  fireEvent.changeText(screen.getByTestId("ai-key-input"), key);
  fireEvent.press(screen.getByTestId("ai-key-save"));
}

describe("a provider refusing a key", () => {
  it("says what the PROVIDER said, and not our sentence", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(payload());
    jest
      .spyOn(aiKeysApi, "add")
      .mockRejectedValue(new KeyRefused("Incorrect API key provided: sk-what***."));

    renderScreen();
    await pasteAndSave();

    await waitFor(() =>
      expect(screen.getByText("Incorrect API key provided: sk-what***.")).toBeTruthy(),
    );
    // Not the generic line. The person can act on the provider's words and
    // cannot act on ours.
    expect(screen.queryByTestId("ai-keys-error")).toBeNull();
  });

  it("KEEPS what was pasted, so a rejected key can be corrected rather than retyped", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(payload());
    jest.spyOn(aiKeysApi, "add").mockRejectedValue(new KeyRefused("Incorrect API key."));

    renderScreen();
    await pasteAndSave("sk-almost-right");

    await waitFor(() => expect(screen.getByTestId("ai-key-refused")).toBeTruthy());
    expect(screen.getByTestId("ai-key-input").props.value).toBe("sk-almost-right");
  });
});

describe("the request itself failing", () => {
  it("shows OUR sentence, because the key may be perfectly good", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(payload());
    jest.spyOn(aiKeysApi, "add").mockRejectedValue(new Error("socket hang up"));

    renderScreen();
    await pasteAndSave();

    await waitFor(() => expect(screen.getByTestId("ai-keys-error")).toBeTruthy());
    // And NOT dressed up as the provider's verdict on the key.
    expect(screen.queryByTestId("ai-key-refused")).toBeNull();
  });

  it("reports a removal that failed, rather than showing the key as gone", async () => {
    // The one that would be worst silently: the row disappears, the person
    // believes the credential is revoked, and it is still live and still billing.
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(
      payload({
        keys: [
          { id: 1, provider: "openai", masked: "sk-…4f2a", active: true, verified: true, verifiedAt: null, verificationError: null },
        ],
      }),
    );
    jest.spyOn(aiKeysApi, "remove").mockRejectedValue(new Error("nope"));

    renderScreen();
    await waitFor(() => expect(screen.getByTestId("ai-key-remove-openai")).toBeTruthy());
    fireEvent.press(screen.getByTestId("ai-key-remove-openai"));

    await waitFor(() => expect(screen.getByTestId("ai-keys-error")).toBeTruthy());
    expect(screen.getByTestId("ai-key-openai")).toBeTruthy();
  });
});

/** A key lent to this user; no monthly limit unless the test sets one. */
const lent = (over: Partial<BorrowedKey> = {}): BorrowedKey => ({
  provider: "gemini", ownerName: "Husna", monthlyCreditLimit: null, spentThisMonth: 0, exhausted: false, ...over,
});

describe("a key somebody else lent you", () => {
  // ── THE LENDER'S MONTHLY LIMIT (multi_magic 9a5a3cb) ──────────────────────
  it("shows how much of the month's limit is used", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(
      payload({ borrowed: [lent({ monthlyCreditLimit: 10, spentThisMonth: 3.25 })] }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("ai-keys-borrowed-0-limit")).toBeTruthy());
    expect(screen.getByText("3.25 of 10 credits used this month")).toBeTruthy();
    const bar = screen.getByLabelText("Monthly credit limit");
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 3.25 });
  });

  it("says it is used up, and the date it works again, when the limit is reached", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(
      payload({ borrowed: [lent({ monthlyCreditLimit: 10, spentThisMonth: 10.5, exhausted: true })] }),
    );
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("ai-keys-borrowed-0-limit")).toBeTruthy());
    expect(screen.getByText(/^Used up for this month\. Works again on .+\.$/)).toBeTruthy();
  });

  it("adds nothing when the lender set no limit", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(payload({ borrowed: [lent()] }));
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("ai-keys-borrowed")).toBeTruthy());
    expect(screen.queryByTestId("ai-keys-borrowed-0-limit")).toBeNull();
  });

  it("names the person, because it is not yours to remove", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(
      payload({ borrowed: [lent({ ownerName: "Husna" })] }),
    );

    renderScreen();

    await waitFor(() => expect(screen.getByTestId("ai-keys-borrowed")).toBeTruthy());
    expect(screen.getByText(/gemini — lent to you by Husna/)).toBeTruthy();
  });

  it("falls back to 'someone' rather than printing nothing", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(
      payload({ borrowed: [lent({ ownerName: null })] }),
    );

    renderScreen();

    await waitFor(() => expect(screen.getByText(/lent to you by someone/)).toBeTruthy());
  });

  it("shows no borrowed section when nobody has lent you anything", async () => {
    jest.spyOn(aiKeysApi, "list").mockResolvedValue(payload());
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("ai-keys-empty")).toBeTruthy());
    expect(screen.queryByTestId("ai-keys-borrowed")).toBeNull();
  });
});
