/**
 * THE NEXT ENTRY'S CURRENCY (black-box run, 2026-11-17: a new expense
 * defaulted to USD while the app showed €). The currency last used is kept
 * PER USER: another account's choice, or one left on the phone by an older
 * version, is not this user's. With nothing remembered it is EUR, the web's
 * default. No currency is written into a form as a literal default.
 */
import fs from "fs";
import path from "path";
import { renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores/auth.store";
import { useLastCurrency, lastCurrencyKey } from "../lastCurrency";

const signIn = (id: number) =>
  useAuthStore.setState({ status: "signedIn", user: { id, email: "qa@example.test", firstName: "Qa", lastName: "User", fullName: "Qa User", avatar: null } });

beforeEach(async () => {
  await AsyncStorage.clear();
  signIn(7);
});

describe("useLastCurrency", () => {
  it("is the currency this user used last", async () => {
    await AsyncStorage.setItem(lastCurrencyKey(7), "gbp");
    const { result } = renderHook(() => useLastCurrency());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.currency).toBe("gbp");
  });

  it("another user's choice is not this user's: EUR", async () => {
    await AsyncStorage.setItem(lastCurrencyKey(9), "usd");
    const { result } = renderHook(() => useLastCurrency());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.currency).toBe("eur");
  });

  it("the old phone-wide value (one left from before) is not trusted: EUR", async () => {
    await AsyncStorage.setItem("finance_last_currency", "usd");
    const { result } = renderHook(() => useLastCurrency());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.currency).toBe("eur");
  });

  it("remembering writes it for this user only", async () => {
    const { result } = renderHook(() => useLastCurrency());
    await waitFor(() => expect(result.current.ready).toBe(true));
    result.current.remember("usd");
    await waitFor(async () => expect(await AsyncStorage.getItem(lastCurrencyKey(7))).toBe("usd"));
    expect(await AsyncStorage.getItem(lastCurrencyKey(9))).toBeNull();
  });
});

it("no finance form writes a currency literal as its default", () => {
  for (const file of ["app/finance/entry.tsx", "app/finance/loan-edit.tsx", "app/finance/recurring-edit.tsx"]) {
    const src = fs.readFileSync(path.join(__dirname, "../../../..", file), "utf8");
    expect(src).not.toMatch(/useState<Currency>\(\s*["'](usd|eur|gbp)["']/);
    expect(src).not.toMatch(/finance_last_currency/);
  }
});
