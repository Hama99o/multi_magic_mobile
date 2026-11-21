/**
 * useNav / useNavParams (docs/design/workspace/SPEC.md §C3): outside a pane
 * they ARE expo-router's; inside one, the pane's, and the singleton is never
 * touched. That second half is the whole reason the codemod exists.
 */
import { renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { router } from "expo-router";
import { PaneNavContext, useNav, useNavParams, type Nav } from "../nav";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ id: "app-level" }),
}));

it("outside a pane: the router singleton itself, and the route's own params", () => {
  const { result } = renderHook(() => ({ nav: useNav(), params: useNavParams<{ id: string }>() }));
  expect(result.current.nav).toBe(router);
  expect(result.current.params).toEqual({ id: "app-level" });
});

it("inside a pane: the pane's stack and params; the singleton is never called", () => {
  const pane = { push: jest.fn(), back: jest.fn() } as unknown as Nav;
  const wrapper = ({ children }: { children: ReactNode }) => <PaneNavContext.Provider value={{ nav: pane, params: { id: "pane-level" } }}>{children}</PaneNavContext.Provider>;
  const { result } = renderHook(() => ({ nav: useNav(), params: useNavParams<{ id: string }>() }), { wrapper });
  result.current.nav.push("/notes");
  expect(pane.push).toHaveBeenCalledWith("/notes");
  expect(router.push).not.toHaveBeenCalled();
  expect(result.current.params).toEqual({ id: "pane-level" });
});
