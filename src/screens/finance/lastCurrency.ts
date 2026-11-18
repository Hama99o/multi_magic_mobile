/**
 * The currency last used for an entry, the default for the next one (SPEC
 * B7). A per-USER convenience on this phone (black-box run, 2026-11-17: a
 * phone-wide value left by another account or an older run made a new
 * expense default to USD while the app showed €). The server has no currency
 * setting; each record carries its own. Nothing remembered, or storage that
 * cannot be read, means EUR, the web's default. Used by the entry form and
 * the loan form, the only two places that read or write it.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCIES, type Currency } from "@/api/finance";
import { useAuthStore } from "@/stores/auth.store";

/** The app's own currency when nothing is remembered: the web's default. */
export const APP_CURRENCY: Currency = "eur";

export function lastCurrencyKey(userId: number | null): string {
  return `finance_last_currency:${userId ?? "anon"}`;
}

export function useLastCurrency(): { ready: boolean; currency: Currency; remember: (c: Currency) => void } {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const key = lastCurrencyKey(userId);
  const [state, setState] = useState<{ key: string | null; currency: Currency }>({ key: null, currency: APP_CURRENCY });
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(key)
      .then((v) => alive && setState({ key, currency: CURRENCIES.find((c) => c === v) ?? APP_CURRENCY }))
      .catch(() => alive && setState({ key, currency: APP_CURRENCY }));
    return () => {
      alive = false;
    };
  }, [key]);
  const remember = (c: Currency) => void AsyncStorage.setItem(key, c).catch(() => undefined);
  return { ready: state.key === key, currency: state.currency, remember };
}
