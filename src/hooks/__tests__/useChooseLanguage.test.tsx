/**
 * Choosing the language: the phone applies it at once; the server is told
 * through a mutation that also keeps the cached profile in step; a failed
 * write never undoes the choice (moved here from language.store.test.ts).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import i18n from "@/i18n";
import { profileApi, type Profile } from "@/api/profile";
import { profileKeys } from "@/api/keys";
import { testQueryClient } from "@/__tests__/queryClient";
import { __resetLanguage, useLanguage } from "@/stores/language.store";
import { useChooseLanguage } from "../useChooseLanguage";

const ME = { id: 7, email: "q@example.test", lang: "en", firstName: null, lastName: null, fullName: null, username: null, about: null, phoneNumber: null, aiMorningBrief: null, avatar: null, createdAt: null } as Profile;
let client: QueryClient;
let update: jest.SpyInstance;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetLanguage();
  client = testQueryClient({ queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } });
  client.setQueryData(profileKeys.me(), ME);
  update = jest.spyOn(profileApi, "update").mockResolvedValue({ ...ME, lang: "fr" });
});
afterEach(async () => {
  jest.restoreAllMocks();
  client.clear();
  __resetLanguage();
  await i18n.changeLanguage("en");
});

it("applies it at once, and tells the server the field the web writes", async () => {
  const { result } = renderHook(() => useChooseLanguage(7), { wrapper });
  act(() => result.current("fr"));
  expect(useLanguage.getState().language).toBe("fr");
  expect(i18n.language).toBe("fr");
  await waitFor(() => expect(update).toHaveBeenCalledWith(7, { lang: "fr" }));
  await waitFor(() => expect(client.getQueryData<Profile>(profileKeys.me())?.lang).toBe("fr"));
});

it("signed out: applies it, and sends nothing", () => {
  const { result } = renderHook(() => useChooseLanguage(null), { wrapper });
  act(() => result.current("fr"));
  expect(useLanguage.getState().language).toBe("fr");
  expect(update).not.toHaveBeenCalled();
});

it("a failed write does not undo the choice; the cached profile goes back to the server's", async () => {
  update.mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() => useChooseLanguage(7), { wrapper });
  act(() => result.current("fr"));
  await waitFor(() => expect(update).toHaveBeenCalled());
  await waitFor(() => expect(client.getQueryData<Profile>(profileKeys.me())?.lang).toBe("en"));
  expect(useLanguage.getState().language).toBe("fr");
});
