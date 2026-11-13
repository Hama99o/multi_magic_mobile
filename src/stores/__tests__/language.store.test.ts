/**
 * The language, and the three answers that can set it.
 *
 * The one that matters is the ORDER: a choice made on this phone outranks the
 * server's, because somebody who has just switched must not be switched back
 * by a profile request landing a moment later.
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
  // pressed English, and must not put them back into French.
  it("NEVER overrides a choice made on this phone", () => {
    state().setLanguage("en");

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
    expect(state().chosenHere).toBe(true);
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
