/**
 * The language, and the three answers that can set it.
 *
 * The one that matters is the ORDER: a choice made on this phone and not yet
 * confirmed outranks the server's, because somebody who has just switched must
 * not be switched back by a profile request landing a moment later; once the
 * server has it, the server (users.lang) wins, so the laptop reaches the phone.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { __resetLanguage, useLanguage } from "../language.store";
import i18n from "@/i18n";
import { profileApi } from "@/api/profile";

let update: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __resetLanguage();
  update = jest.spyOn(profileApi, "update").mockResolvedValue({
    id: 7, email: "q@example.test", lang: "fr", firstName: null, lastName: null,
    fullName: null, username: null, about: null, phoneNumber: null, aiMorningBrief: null, avatar: null,
    createdAt: null,
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  __resetLanguage();
  await i18n.changeLanguage("en");
});

const state = () => useLanguage.getState();

describe("choosing on this phone", () => {
  // Telling the server is no longer the store's job (docs/DATA_LAYER.md):
  // `src/hooks/__tests__/useChooseLanguage.test.tsx` has those three cases.
  it("applies it and remembers it, and the store sends nothing", async () => {
    state().setLanguage("fr");

    expect(state().language).toBe("fr");
    expect(i18n.language).toBe("fr");
    expect(await AsyncStorage.getItem("mm-language")).toBe("fr");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("what the server has", () => {
  it("arrives when this phone has not chosen — the web's switch reaches here", () => {
    state().applyFromServer("fr");

    expect(state().language).toBe("fr");
    expect(i18n.language).toBe("fr");
  });

  // The race this closes: the profile request lands a moment after somebody
  // pressed English, and must not put them back into French. Until the
  // server has CONFIRMED the phone's choice, the phone's choice stands.
  it("does not override a choice the server has not confirmed yet", async () => {
    state().setLanguage("en");

    state().applyFromServer("fr");

    expect(state().language).toBe("en");
    expect(await AsyncStorage.getItem("mm-language-pending")).toBe("1");
  });

  // Hello for the owner, 2026-11-20 (a device pass saw it): the language lives
  // in users.lang, so a switch on the LAPTOP must reach a phone that once
  // chose for itself. Once the phone's choice is confirmed, the server wins.
  it("a switch made elsewhere reaches a phone that chose before, once that choice was confirmed", async () => {
    state().setLanguage("en");
    state().markSynced("en");

    state().applyFromServer("fr");

    expect(state().language).toBe("fr");
    expect(i18n.language).toBe("fr");
    // Saved here too, so the next cold start opens in French before the profile lands.
    expect(await AsyncStorage.getItem("mm-language")).toBe("fr");
  });

  it("a confirmation for an OLDER choice does not clear a newer one", () => {
    state().setLanguage("fr");
    state().setLanguage("en");
    state().markSynced("fr");

    state().applyFromServer("fr");

    expect(state().language).toBe("en");
  });

  it("a pending choice survives a restart, and still outranks the server", async () => {
    await AsyncStorage.setItem("mm-language", "en");
    await AsyncStorage.setItem("mm-language-pending", "1");
    await state().hydrate();

    state().applyFromServer("fr");

    expect(state().language).toBe("en");
  });

  it("ignores a language this app does not have", () => {
    state().applyFromServer("de");
    state().applyFromServer(null);

    expect(state().language).toBe("en");
  });
});

describe("hydrating at launch", () => {
  it("restores the stored choice before the first paint", async () => {
    await AsyncStorage.setItem("mm-language", "fr");

    await state().hydrate();

    expect(state().language).toBe("fr");
    // Stored and not pending is a CONFIRMED choice (or one from before
    // 2026-11-20): it paints first, and the server may still replace it.
    expect(state().chosenHere).toBe(false);
    expect(state().hydrated).toBe(true);
    expect(i18n.language).toBe("fr");
  });

  // The OS locale is deliberately not consulted: this interface is English by
  // decision while the corpus is largely French, so a French phone must not
  // flip the whole app on somebody who never asked.
  it("is English when nothing was stored, whatever the phone's locale", async () => {
    await state().hydrate();

    expect(state().language).toBe("en");
    expect(state().chosenHere).toBe(false);
    expect(state().hydrated).toBe(true);
  });

  it("is hydrated even when storage cannot be read", async () => {
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValue(new Error("no storage"));

    await state().hydrate();

    expect(state().hydrated).toBe(true);
    expect(state().language).toBe("en");
  });
});
