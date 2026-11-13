/**
 * `useMe()`: the profile from the cache, the sign-in identity as the
 * fallback, nobody when signed out (docs/DATA_LAYER.md).
 */
import MockAdapter from "axios-mock-adapter";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { useAuthStore } from "@/stores/auth.store";
import { profileKeys } from "@/api/keys";
import { useMe } from "../useMe";

const SESSION = { id: 7, email: "qa@example.test", firstName: "Qa", lastName: "Session", fullName: "Qa Session", avatar: null };
let mock: MockAdapter;

function wrap() {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => {
  mock = new MockAdapter(http);
});
afterEach(() => {
  mock.restore();
  useAuthStore.setState({ status: "signedOut", user: null });
});

it("signed out: nobody, and the profile is not asked for", () => {
  useAuthStore.setState({ status: "signedOut", user: null });
  const { result } = renderHook(() => useMe(), wrap());
  expect(result.current).toBeNull();
  expect(mock.history.get).toHaveLength(0);
});

it("signed in: the sign-in identity at once, then the profile from the server", async () => {
  useAuthStore.setState({ status: "signedIn", user: SESSION });
  mock.onGet(/connected_user/).reply(200, { user: { id: 7, email: "qa@example.test", firstname: "Qa", lastname: "Renamed", fullname: "Qa Renamed", avatar: null, lang: "fr" } });
  const { result } = renderHook(() => useMe(), wrap());
  expect(result.current?.fullName).toBe("Qa Session");
  await waitFor(() => expect(result.current?.fullName).toBe("Qa Renamed"));
});

it("a profile saved elsewhere reaches every reader through the cache, no restart", async () => {
  useAuthStore.setState({ status: "signedIn", user: SESSION });
  mock.onGet(/connected_user/).reply(200, { user: { id: 7, email: "qa@example.test", firstname: "Qa", lastname: "Session", fullname: "Qa Session", avatar: null, lang: "en" } });
  const { client, wrapper } = wrap();
  const { result } = renderHook(() => useMe(), { wrapper });
  await waitFor(() => expect(result.current?.fullName).toBe("Qa Session"));
  const before = client.getQueryData(profileKeys.me()) as Record<string, unknown>;
  client.setQueryData(profileKeys.me(), { ...before, fullName: "Qa Changed" });
  await waitFor(() => expect(result.current?.fullName).toBe("Qa Changed"));
});
