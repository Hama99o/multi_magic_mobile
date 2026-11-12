/**
 * The country a national number (07xx, 06xx) belongs to when the contact's
 * own address does not say — for WhatsApp (`docs/design/contacts/SPEC.md`
 * §C.4). The account has no such setting on the server, so it lives on this
 * device: pre-filled from the phone's region, changeable in Contacts, kept.
 *
 * `null` means "not known", and WhatsApp then asks rather than guess.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { countryByCode, countryFromLocale, type CountryCode } from "@/screens/contacts/phone";

const KEY = "mm-contacts-country";

/** The phone's region, from the JS engine's locale (Hermes `Intl`). */
export function deviceCountry(): CountryCode | null {
  try {
    return countryFromLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

interface CountryState {
  country: CountryCode | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCountry: (country: CountryCode) => void;
}

export const useContactsCountry = create<CountryState>((set, get) => ({
  country: deviceCountry(),
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = await AsyncStorage.getItem(KEY);
      if (!get().hydrated) set({ country: countryByCode(stored)?.code ?? get().country, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setCountry: (country) => {
    set({ country, hydrated: true });
    void AsyncStorage.setItem(KEY, country).catch(() => undefined);
  },
}));
