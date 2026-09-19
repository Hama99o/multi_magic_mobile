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
    fullName: null, username: null, about: null, phoneNumber: null, avatar: null,
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
  it("applies it, remembers it, and tells the server", async () => {
    state().setLanguage("fr", 7);

    expect(state().language).toBe("fr");
    expect(i18n.language).toBe("fr");
    expect(await AsyncStorage.getItem("mm-language")).toBe("fr");
    // The same field the web's switcher writes.
    expect(update).toHaveBeenCalledWith(7, { lang: "fr" });
  });

  it("still applies it when nobody is signed in yet", () => {
    state().setLanguage("fr", null);

    expect(state().language).toBe("fr");
    expect(update).not.toHaveBeenCalled();
  });

  // The label is already changed by the time the request goes out; a failed
  // write costs the other clients not knowing, which is recoverable.
  it("does not undo the choice when the server write fails", async () => {
    update.mockRejectedValue(new Error("offline"));

    state().setLanguage("fr", 7);
    await Promise.resolve();

    expect(state().language).toBe("fr");
    expect(i18n.language).toBe("fr");
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
    state().setLanguage("en", null);

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
