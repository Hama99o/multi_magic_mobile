/**
 * The currency last used for an entry on this phone, the default for the
 * next one (SPEC B7). A per-phone convenience in AsyncStorage: the server has
 * no currency setting, each record carries its own. A failed read means EUR,
 * the web's default.
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CURRENCIES, type Currency } from "@/api/finance";

export const LAST_CURRENCY_KEY = "finance_last_currency";

export function useLastCurrency(): { ready: boolean; currency: Currency; remember: (c: Currency) => void } {
  const [state, setState] = useState<{ ready: boolean; currency: Currency }>({ ready: false, currency: "eur" });
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(LAST_CURRENCY_KEY)
      .then((v) => alive && setState({ ready: true, currency: CURRENCIES.find((c) => c === v) ?? "eur" }))
      .catch(() => alive && setState({ ready: true, currency: "eur" }));
    return () => {
      alive = false;
    };
  }, []);
  const remember = (c: Currency) => void AsyncStorage.setItem(LAST_CURRENCY_KEY, c).catch(() => undefined);
  return { ...state, remember };
}
